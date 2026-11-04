import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { Cart, Product } from '@/payload-types'
import { asMedia, type ImageAttributes, thumbnailAttributes } from '@/theme/media'

import { shopConfig } from '../config'
import { productPath } from '../products/paths'
import { productPrice } from '../products/price'
import { calculateShipping } from '../shipping/calculate'
import { productIdOf } from './checkItems'
import { type CartProduct, type LineProblem, lineProblem, MAX_LINE_QUANTITY, priceSelect } from './rules'

// What the public site shows of a guest's cart. The cart is read with its secret, as the guest
// (`overrideAccess: false`): a wrong secret finds nothing. Its products are read as a visitor
// would read them, so a product that was unpublished or moved to the trash since it was added is
// simply missing, and its line is flagged. Prices and stock are the stored ones, read now.

/** Which cart is the guest's: its id and its secret (from the cart cookie). */
export type CartRef = { id: Cart['id']; secret: string }

export type CartLine = {
  /** The line's id in the cart (`items.id`): what the cart actions change. */
  id: string
  /** `null` once the product was deleted. */
  productId: string | null
  /** The product's name in the page's language; `null` when it is no longer for sale. */
  title: string | null
  href: string | null
  image: ImageAttributes | null
  /** Cents, the current stored price; `null` when the product is no longer for sale. */
  unitPrice: number | null
  quantity: number
  lineTotal: number | null
  /** The most this line may hold: the stock when it is tracked, never past `MAX_LINE_QUANTITY`. */
  maxQuantity: number
  /** Why the line can't be bought as it is, or `null`. Any problem holds checkout back. */
  problem: LineProblem | null
}

export type CartView = {
  id: string
  lines: CartLine[]
  /** How many items, every line's quantity added up. */
  count: number
  /** Cents: the lines that have a price, at today's stored prices. */
  subtotal: number
  /** Cents, from `calculateShipping` (0 for an empty cart). */
  shipping: number
  total: number
  currency: string
  /** `shop.displayTaxRate`, for "prices include 5.5 % VAT". */
  taxRate: number
  /** `shop.shipping.countries` (ISO codes): where the shop delivers. */
  shipsTo: string[]
  /** At least one line and no line with a problem. The checkout re-checks on the server (S17). */
  canCheckout: boolean
}

/** The guest's cart, or `null` when the secret doesn't match, the cart is gone, or it was bought. */
export async function findGuestCart(payload: Payload, ref: CartRef): Promise<Cart | null> {
  const cart = await payload.findByID({
    collection: 'carts',
    id: ref.id,
    depth: 0,
    overrideAccess: false,
    context: { cartSecret: ref.secret },
    disableErrors: true,
  })
  return cart && !cart.purchasedAt ? cart : null
}

type ShownProduct = Pick<Product, 'id' | 'title' | 'slug' | 'images'> & CartProduct

/** The cart's products that visitors can read, photos loaded, in the page's language. */
async function readableProducts(payload: Payload, ids: string[], locale: Locale): Promise<Map<string, ShownProduct>> {
  if (!ids.length) return new Map()
  const { currency } = shopConfig()
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    locale,
    depth: 1,
    pagination: false,
    draft: false,
    overrideAccess: false,
    select: { title: true, slug: true, images: true, inventory: true, ...priceSelect(currency) },
  })
  return new Map(docs.map((doc) => [String(doc.id), doc as ShownProduct]))
}

/** The view of a cart the guest holds: lines, totals and whether checkout may start. */
export async function cartView(payload: Payload, cart: Cart, locale: Locale): Promise<CartView> {
  const { currency, shipping, displayTaxRate } = shopConfig()
  const items = (cart.items ?? []).filter((item) => item.id)
  const ids = [...new Set(items.map((item) => productIdOf(item.product)).filter((id) => id !== null))]
  const products = await readableProducts(payload, ids, locale)
  const totals = new Map<string, number>()
  for (const item of items) {
    const id = productIdOf(item.product)
    if (id) totals.set(id, (totals.get(id) ?? 0) + item.quantity)
  }

  const lines = items.map((item): CartLine => {
    const productId = productIdOf(item.product)
    const product = productId ? (products.get(productId) ?? null) : null
    const unitPrice = product ? productPrice(product, currency) : null
    const photo = asMedia(product?.images?.[0])
    return {
      id: item.id!,
      productId,
      title: product?.title?.trim() || null,
      href: product?.slug ? productPath(locale, product.slug) : null,
      image: photo ? thumbnailAttributes(photo) : null,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice === null ? null : unitPrice * item.quantity,
      maxQuantity: product ? Math.min(product.inventory ?? MAX_LINE_QUANTITY, MAX_LINE_QUANTITY) : 0,
      // A product's lines count together against its stock.
      problem: lineProblem(product, productId ? totals.get(productId)! : item.quantity, currency),
    }
  })

  const subtotal = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0)
  const shippingAmount = calculateShipping({ subtotal }, shipping).amount
  return {
    id: String(cart.id),
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal,
    shipping: shippingAmount,
    total: subtotal + shippingAmount,
    currency,
    taxRate: displayTaxRate,
    shipsTo: shipping.countries,
    canCheckout: lines.length > 0 && lines.every((line) => line.problem === null),
  }
}

/** The guest's cart as the public site shows it, or `null` when there is none. */
export async function loadCart(payload: Payload, ref: CartRef, locale: Locale): Promise<CartView | null> {
  const cart = await findGuestCart(payload, ref)
  return cart ? cartView(payload, cart, locale) : null
}
