import type { ShopConfig } from '@/config'
import type { ProductsSelect } from '@/payload-types'

import { productPrice, type PriceFields } from '../products/price'

// What may be in a cart, as plain rules. The carts collection enforces them on every write
// (`checkCartItems`), and the cart view and the checkout use them to flag lines that went wrong
// after they were added (`lineProblem`, through `priceCart`), so all three always agree.

/** The most of one product a cart may hold, whatever the stock. */
export const MAX_LINE_QUANTITY = 99

/**
 * The most lines (different products) a cart may hold: what one Stripe payment can carry. The
 * plugin's Stripe adapter puts every line in one PaymentIntent metadata value, which holds 500
 * characters, about 61 per line (payments/stripe/metadata.ts).
 */
export const MAX_CART_LINES = 8

/** A product as the cart sees it: what a visitor may read of it. */
export type CartProduct = PriceFields & { id: number | string; inventory?: number | null }

/**
 * Why a line can't be bought as it is:
 * - `unavailable`: the product is no longer for sale (unpublished, in the trash, deleted, no price)
 * - `soldOut`: none left
 * - `notEnoughStock`: fewer left than the line asks for (`available` of them)
 * - `tooMany`: more than `MAX_LINE_QUANTITY` of one product (`max`)
 * - `badQuantity`: the stored quantity is not a whole number of at least 1 (a write the cart's
 *   rules refuse today, but a cart can still hold one)
 */
export type LineProblem =
  | { kind: 'unavailable' }
  | { kind: 'soldOut' }
  | { kind: 'notEnoughStock'; available: number }
  | { kind: 'tooMany'; max: number }
  | { kind: 'badQuantity' }

type Currency = ShopConfig['currency']

/** The `select` for a product's price fields in `currency` (`priceInEUR` and its switch). */
export const priceSelect = (currency: Currency) =>
  ({ [`priceIn${currency}`]: true, [`priceIn${currency}Enabled`]: true }) as Pick<ProductsSelect<true>, `priceIn${Currency}` | `priceIn${Currency}Enabled`>

/** A whole number of at least 1. */
export const isQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1

/** A relationship's id as a string ("12"), whether it came as an id or a loaded document; `null` when empty. */
export function productIdOf(value: unknown): string | null {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' || (typeof id === 'string' && id !== '') ? String(id) : null
}

/**
 * What stops `quantity` of `product` from being bought, or `null` when nothing does. `product` is
 * `null` when visitors can't read it (unpublished, in the trash, deleted). Stock is
 * `products.inventory`; empty means it is not tracked, and only `MAX_LINE_QUANTITY` limits it.
 */
export function lineProblem(product: CartProduct | null, quantity: number, currency: Currency = 'EUR'): LineProblem | null {
  if (!product || productPrice(product, currency) === null) return { kind: 'unavailable' }
  const stock = product.inventory
  if (stock != null && stock <= 0) return { kind: 'soldOut' }
  if (stock != null && stock < MAX_LINE_QUANTITY && quantity > stock) return { kind: 'notEnoughStock', available: stock }
  return quantity > MAX_LINE_QUANTITY ? { kind: 'tooMany', max: MAX_LINE_QUANTITY } : null
}

/** How many more of `product` fit in a cart that holds `inCart` of it: up to the stock, and never past `MAX_LINE_QUANTITY`. */
export function addableQuantity(product: CartProduct, inCart: number): number {
  const stock = product.inventory
  const limit = stock == null ? MAX_LINE_QUANTITY : Math.min(stock, MAX_LINE_QUANTITY)
  return Math.max(0, limit - inCart)
}
