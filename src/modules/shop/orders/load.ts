import { timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { Order, Product } from '@/payload-types'
import { asMedia, thumbnailAttributes } from '@/theme/media'

import type { Summary } from '../checkout/CheckoutSummary'
import { readLinePrices } from '../collections/breakdown'
import { shopConfig } from '../config'
import { productIdOf } from '../cart/rules'

// What the confirmation page shows of an order, to whoever holds its access token (Review focus
// #4): the page never shows an order without it, so order numbers, which follow each other, can't
// be tried one by one. The order and its products are read as trusted server code: a product
// unpublished or deleted since still shows on the order that bought it.

export type OrderView = {
  id: number
  createdAt: string
  status: NonNullable<Order['status']>
  email: string | null
  /** Ready to show, one line each: name, street, complement, postal code and city, country. */
  address: string[]
  firstName: string | null
  phone: string | null
  summary: Summary
}

/** An order id from the URL: digits only. */
const ORDER_ID = /^[1-9][0-9]{0,14}$/

/** Whether `given` is the order's token, compared in constant time. */
function tokenMatches(expected: unknown, given: unknown): boolean {
  if (typeof expected !== 'string' || !expected || typeof given !== 'string' || !given) return false
  const [a, b] = [Buffer.from(expected), Buffer.from(given)]
  return a.length === b.length && timingSafeEqual(a, b)
}

type ShownProduct = Pick<Product, 'id' | 'title' | 'images'>

async function productsOf(payload: Payload, order: Order, locale: Locale): Promise<Map<string, ShownProduct>> {
  const fromItems = (order.items ?? []).map((item) => productIdOf(item.product))
  const fromPrices = readLinePrices(order.linePrices).map((line) => String(line.product))
  const ids = [...new Set([...fromItems, ...fromPrices].filter((id): id is string => Boolean(id)))]
  if (!ids.length) return new Map()
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    locale,
    depth: 1,
    pagination: false,
    overrideAccess: true,
    trash: true,
    select: { title: true, images: true },
  })
  return new Map(docs.map((doc) => [String(doc.id), doc as ShownProduct]))
}

/** The order `id` for the holder of `token`, or `null` (no such order, or not the right token). */
export async function loadOrderForGuest(payload: Payload, input: { id: unknown; token: unknown; locale: Locale }): Promise<OrderView | null> {
  const { id, token, locale } = input
  if (typeof id !== 'string' || !ORDER_ID.test(id) || typeof token !== 'string') return null
  const order = await payload.findByID({ collection: 'orders', id: Number(id), depth: 0, overrideAccess: true, disableErrors: true })
  if (!order || !tokenMatches(order.accessToken, token)) return null

  const shop = shopConfig()
  const products = await productsOf(payload, order, locale)
  const prices = readLinePrices(order.linePrices)
  const shown = (productId: string | null) => {
    const product = productId ? products.get(productId) : undefined
    const photo = asMedia(product?.images?.[0])
    return { title: product?.title?.trim() || null, image: photo ? thumbnailAttributes(photo) : null }
  }
  // The order's lines; or, when it has fewer than were charged (a settlement interrupted), the
  // lines as charged.
  const items = order.items ?? []
  const lines =
    items.length >= prices.length
      ? items.map((item, index) => {
          const productId = productIdOf(item.product)
          const price = prices.find((line) => String(line.product) === productId)
          return { id: item.id ?? String(index), ...shown(productId), quantity: item.quantity, lineTotal: price ? price.lineTotal : null }
        })
      : prices.map((line, index) => ({ id: `charged-${index}`, ...shown(String(line.product)), quantity: line.quantity, lineTotal: line.lineTotal }))
  const total = order.amount ?? 0
  const shipping = order.shippingAmount ?? 0
  const a = order.shippingAddress ?? {}
  const country = a.country ? (new Intl.DisplayNames([locale], { type: 'region' }).of(a.country) ?? a.country) : null
  return {
    id: order.id,
    createdAt: order.createdAt,
    status: order.status ?? 'processing',
    email: order.customerEmail ?? null,
    firstName: a.firstName?.trim() || null,
    phone: a.phone?.trim() || null,
    address: [[a.firstName, a.lastName].filter(Boolean).join(' '), a.addressLine1, a.addressLine2, [a.postalCode, a.city].filter(Boolean).join(' '), country].filter(
      (line): line is string => Boolean(line && line.trim()),
    ),
    summary: {
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: order.subtotal ?? total - shipping,
      shipping,
      total,
      currency: order.currency ?? shop.currency,
      shipsTo: [],
      taxRate: shop.displayTaxRate,
    },
  }
}
