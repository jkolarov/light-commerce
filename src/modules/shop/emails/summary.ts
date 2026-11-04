import type { Locale } from '@/core/i18n/locales'
import type { Order } from '@/payload-types'

import { productIdOf } from '../cart/rules'
import { readLinePrices } from '../collections/breakdown'
import { shopConfig } from '../config'

// What both order emails show of an order, as plain values (text, cents), in one language.
// Pure: the sender reads the order and its products' names first (./send.ts).

export type EmailLine = {
  /** The product's name in the email's language, or `null` when the product is gone. */
  name: string | null
  quantity: number
  /** As charged, in cents; `null` for an order without line prices. */
  lineTotal: number | null
}

export type OrderSummary = {
  /** The order number as shown: its digits, never grouped ("1042", not "1 042"). */
  number: string
  /** When it was placed, as a long date in the email's language. */
  date: string
  lines: EmailLine[]
  subtotal: number
  shipping: number
  total: number
  currency: string
  /** `shop.displayTaxRate`, a percentage. */
  taxRate: number
  firstName: string | null
  /** First and last name. */
  name: string | null
  email: string | null
  phone: string | null
  /** The shipping address, one line each: name, street, complement, postal code and city, country. */
  address: string[]
}

/** A product's name when the relation is read (a product object), else `null`. */
function titleOf(product: unknown): string | null {
  const title = product && typeof product === 'object' ? (product as { title?: unknown }).title : null
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

const trimmed = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)

/**
 * The lines as charged (`linePrices`, which outlive a product deleted for good), named from the
 * order's lines when their product was read; the plain lines, without prices, for an order that
 * has no line prices.
 */
function linesOf(order: Order): EmailLine[] {
  const items = order.items ?? []
  const prices = readLinePrices(order.linePrices)
  if (!prices.length) return items.map((item) => ({ name: titleOf(item.product), quantity: item.quantity, lineTotal: null }))
  return prices.map((line) => {
    const item = items.find((candidate) => productIdOf(candidate.product) === String(line.product))
    return { name: item ? titleOf(item.product) : null, quantity: line.quantity, lineTotal: line.lineTotal }
  })
}

export function summarizeOrder(order: Order, locale: Locale): OrderSummary {
  const shop = shopConfig()
  const a = order.shippingAddress ?? {}
  const name = trimmed([a.firstName, a.lastName].filter(Boolean).join(' '))
  const country = a.country ? (new Intl.DisplayNames([locale], { type: 'region' }).of(a.country) ?? a.country) : null
  const total = order.amount ?? 0
  const shipping = order.shippingAmount ?? 0
  return {
    number: String(order.id),
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(order.createdAt)),
    lines: linesOf(order),
    subtotal: order.subtotal ?? total - shipping,
    shipping,
    total,
    currency: order.currency ?? shop.currency,
    taxRate: shop.displayTaxRate,
    firstName: trimmed(a.firstName),
    name,
    email: trimmed(order.customerEmail),
    phone: trimmed(a.phone),
    address: [name, a.addressLine1, a.addressLine2, [a.postalCode, a.city].filter(Boolean).join(' '), country]
      .map((line) => trimmed(line))
      .filter((line): line is string => line !== null),
  }
}
