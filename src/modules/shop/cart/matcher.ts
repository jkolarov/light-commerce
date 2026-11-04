import type { CartItemMatcher } from '@payloadcms/plugin-ecommerce'

import { productIdOf } from './rules'

/**
 * Which cart line an "add to cart" adds to: the line of the same product (and variant, none here).
 * The plugin's own matcher reads `existingItem.product.id`, and a product deleted for good leaves
 * its lines with `product: null`, so adding anything to such a cart failed before any hook ran.
 * This one skips those lines (the cart's next write drops them), and compares ids as strings, so
 * `"12"` and `12` are the same product.
 */
export const cartItemMatcher: CartItemMatcher = ({ existingItem, newItem }) => {
  const existing = productIdOf(existingItem.product)
  return existing !== null && existing === productIdOf(newItem.product) && productIdOf(existingItem.variant) === productIdOf(newItem.variant)
}
