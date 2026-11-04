import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { Cart, Product } from '@/payload-types'
import { asMedia, type ImageAttributes, thumbnailAttributes } from '@/theme/media'

import { shopConfig } from '../config'
import { productPath } from '../products/paths'
import { type CartItemLike, type CartPricing, priceCart } from './price'
import { type CartProduct, type LineProblem, MAX_LINE_QUANTITY, priceSelect, productIdOf } from './rules'

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
  /** Cents: the lines that have a price, at today's stored prices (`priceCart`). */
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

/** The distinct product ids of a cart's lines. */
const productIds = (items: readonly CartItemLike[]) => [...new Set(items.map((item) => productIdOf(item.product)).filter((id) => id !== null))]

/**
 * The cart's products that visitors can read (published, not in the trash), with their price and
 * live stock, keyed by id. As an anonymous visitor: no `req`, no user. `extra` adds fields to show.
 */
async function readableProducts<T extends CartProduct>(
  payload: Payload,
  ids: string[],
  opts: { locale?: Locale; depth?: number; extra?: Partial<Record<'title' | 'slug' | 'images', true>> } = {},
): Promise<Map<string, T>> {
  if (!ids.length) return new Map()
  const { currency } = shopConfig()
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    locale: opts.locale,
    depth: opts.depth ?? 0,
    pagination: false,
    draft: false,
    overrideAccess: false,
    select: { inventory: true, ...priceSelect(currency), ...opts.extra },
  })
  return new Map(docs.map((doc) => [String(doc.id), doc as unknown as T]))
}

/**
 * What a cart costs now, for the checkout (S17): its products read as visitors read them, priced
 * from today's stored prices with `priceCart`, the same rules as the cart page. Charge `total` and
 * refuse the cart unless `canCheckout`; never `carts.subtotal`. Works on any cart read (`items`
 * with products as ids or loaded documents).
 */
export async function priceGuestCart(payload: Payload, cart: { items?: CartItemLike[] | null }): Promise<CartPricing> {
  const items = cart.items ?? []
  return priceCart(items, await readableProducts(payload, productIds(items)), shopConfig())
}

/** The view of a cart the guest holds: lines with name and photo, totals, and whether checkout may start. */
export async function cartView(payload: Payload, cart: Cart, locale: Locale): Promise<CartView> {
  const shop = shopConfig()
  const items = cart.items ?? []
  const products = await readableProducts<ShownProduct>(payload, productIds(items), {
    locale,
    depth: 1,
    extra: { title: true, slug: true, images: true },
  })
  const pricing = priceCart(items, products, shop)

  const lines = pricing.lines.map((priced): CartLine => {
    const product = priced.productId ? (products.get(priced.productId) ?? null) : null
    const photo = asMedia(product?.images?.[0])
    return {
      ...priced,
      id: priced.id ?? '',
      title: product?.title?.trim() || null,
      href: product?.slug ? productPath(locale, product.slug) : null,
      image: photo ? thumbnailAttributes(photo) : null,
      maxQuantity: product ? Math.min(product.inventory ?? MAX_LINE_QUANTITY, MAX_LINE_QUANTITY) : 0,
    }
  })

  return {
    id: String(cart.id),
    lines,
    count: pricing.count,
    subtotal: pricing.subtotal,
    shipping: pricing.shipping,
    total: pricing.total,
    currency: shop.currency,
    taxRate: shop.displayTaxRate,
    shipsTo: shop.shipping.countries,
    canCheckout: pricing.canCheckout,
  }
}

/** The guest's cart as the public site shows it, or `null` when there is none. */
export async function loadCart(payload: Payload, ref: CartRef, locale: Locale): Promise<CartView | null> {
  const cart = await findGuestCart(payload, ref)
  return cart ? cartView(payload, cart, locale) : null
}
