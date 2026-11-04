import type { ShopConfig } from '@/config'
import type { ProductsSelect } from '@/payload-types'

import { productPrice, type PriceFields } from '../products/price'

// What may be in a cart, as plain rules. The carts collection enforces them on every write
// (`checkCartItems`), and the cart view uses them to flag lines that went wrong after they were
// added (`lineProblem`), so the two always agree.

/** The most of one product a cart line offers, when the stock does not set a lower limit. */
export const MAX_LINE_QUANTITY = 99

/** A product as the cart sees it: what a visitor may read of it. */
export type CartProduct = PriceFields & { id: number | string; inventory?: number | null }

/**
 * Why a line can't be bought as it is:
 * - `unavailable`: the product is no longer for sale (unpublished, in the trash, deleted, no price)
 * - `soldOut`: none left
 * - `notEnoughStock`: fewer left than the line asks for (`available` of them)
 */
export type LineProblem = { kind: 'unavailable' } | { kind: 'soldOut' } | { kind: 'notEnoughStock'; available: number }

type Currency = ShopConfig['currency']

/** The `select` for a product's price fields in `currency` (`priceInEUR` and its switch). */
export const priceSelect = (currency: Currency) =>
  ({ [`priceIn${currency}`]: true, [`priceIn${currency}Enabled`]: true }) as Pick<ProductsSelect<true>, `priceIn${Currency}` | `priceIn${Currency}Enabled`>

/** A whole number of at least 1. */
export const isQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1

/**
 * What stops `quantity` of `product` from being bought, or `null` when nothing does. `product` is
 * `null` when visitors can't read it (unpublished, in the trash, deleted). Stock is
 * `products.inventory`; empty means it is not tracked, and the product sells without a limit.
 */
export function lineProblem(product: CartProduct | null, quantity: number, currency: Currency = 'EUR'): LineProblem | null {
  if (!product || productPrice(product, currency) === null) return { kind: 'unavailable' }
  const stock = product.inventory
  if (stock == null) return null
  if (stock <= 0) return { kind: 'soldOut' }
  return quantity > stock ? { kind: 'notEnoughStock', available: stock } : null
}

/** How many more of `product` fit in a cart that holds `inCart` of it: up to the stock, and never past `MAX_LINE_QUANTITY`. */
export function addableQuantity(product: CartProduct, inCart: number): number {
  const stock = product.inventory
  const limit = stock == null ? MAX_LINE_QUANTITY : Math.min(stock, MAX_LINE_QUANTITY)
  return Math.max(0, limit - inCart)
}
