import type { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'

// What the admin shows of the shop (design 4.7: the admin is for weekly tasks only).

/** The admin navigation group for products and orders. */
export const shopGroup = { en: 'Shop', fr: 'Boutique' }

/**
 * For the plugin's machinery collections (carts, addresses): gone from the admin navigation and
 * their admin URLs, still working through the API (guest carts), and no version history.
 */
export const hiddenFromAdmin: CollectionOverride = ({ defaultCollection }) => ({
  ...defaultCollection,
  admin: { ...defaultCollection.admin, hidden: true },
  versions: false,
})
