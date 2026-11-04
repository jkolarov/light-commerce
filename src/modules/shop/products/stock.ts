// What the shop says about a product's stock. Stock is `products.inventory`, a whole number of
// units; empty means the product's stock is not tracked, and the ecommerce plugin then sells it
// without a limit (its `defaultProductsValidation` only refuses 0, or less than the quantity).

/**
 * At this many units or fewer the product page says how many are left ("Plus que 3 en stock").
 * Five is about one week of orders for a small producer's slower products: enough warning to
 * matter, rare enough not to show on every product.
 */
export const LOW_STOCK_THRESHOLD = 5

export type StockState = 'available' | 'low' | 'soldOut'

/** Available, low (1 to `LOW_STOCK_THRESHOLD` units) or sold out (0). */
export function stockState(inventory: number | null | undefined): StockState {
  if (inventory == null) return 'available'
  if (inventory <= 0) return 'soldOut'
  return inventory <= LOW_STOCK_THRESHOLD ? 'low' : 'available'
}
