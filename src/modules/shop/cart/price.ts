import type { ShopConfig } from '@/config'

import { productPrice } from '../products/price'
import { calculateShipping } from '../shipping/calculate'
import { type CartProduct, type LineProblem, lineProblem, productIdOf } from './rules'

// What a cart costs, from today's stored prices: the one calculation the cart page, the drawer
// and the checkout (S17) share. The cart's own `subtotal` field is never used: the plugin writes
// it at the last cart change, so it goes stale after a price change, still counts a line whose
// price was switched off, and holds whatever a broken write left there.

/** A cart line as stored (`carts.items`): the product as an id or a loaded document. */
export type CartItemLike = { id?: string | null; product?: unknown; quantity: number }

export type PricedLine = {
  /** The line's id in the cart (`items.id`). */
  id: string | null
  /** `null` once the product was deleted. */
  productId: string | null
  quantity: number
  /** Cents, the current stored price; `null` when the product is no longer for sale. */
  unitPrice: number | null
  lineTotal: number | null
  /** Why the line can't be bought as it is, or `null`. */
  problem: LineProblem | null
}

export type CartPricing = {
  lines: PricedLine[]
  /** Every line's quantity added up. */
  count: number
  /** Cents: the lines that have a price. */
  subtotal: number
  /** Cents, from `calculateShipping` (0 for an empty cart). */
  shipping: number
  /** Cents: what the checkout charges. */
  total: number
  /** At least one line and no line with a problem. */
  canCheckout: boolean
}

/**
 * Prices a cart's `items` against `products`: the cart's products as visitors read them now
 * (published, not in the trash), keyed by id (`productIdOf`). A product missing from it is no
 * longer for sale. A product's lines count together against its stock and `MAX_LINE_QUANTITY`.
 */
export function priceCart(
  items: readonly CartItemLike[],
  products: ReadonlyMap<string, CartProduct>,
  shop: Pick<ShopConfig, 'currency' | 'shipping'>,
): CartPricing {
  const totals = new Map<string, number>()
  for (const item of items) {
    const id = productIdOf(item.product)
    if (id) totals.set(id, (totals.get(id) ?? 0) + item.quantity)
  }
  const lines = items.map((item): PricedLine => {
    const productId = productIdOf(item.product)
    const product = productId ? (products.get(productId) ?? null) : null
    const unitPrice = product ? productPrice(product, shop.currency) : null
    return {
      id: item.id ?? null,
      productId,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice === null ? null : unitPrice * item.quantity,
      problem: lineProblem(product, productId ? totals.get(productId)! : item.quantity, shop.currency),
    }
  })
  const subtotal = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0)
  const shipping = calculateShipping({ subtotal }, shop.shipping).amount
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal,
    shipping,
    total: subtotal + shipping,
    canCheckout: lines.length > 0 && lines.every((line) => line.problem === null),
  }
}
