import type { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'

const nobody = () => false

// Transactions: one per payment attempt, written only by the plugin (it passes `overrideAccess`).
// Read-only for everyone, staff included, and out of the admin navigation; the documents still
// open from an order. No version history (the plugin updates them during settlement).
// S17 adds `subtotal` and `shippingAmount` here (plan, "Orders").
export const transactionsOverride: CollectionOverride = ({ defaultCollection }) => ({
  ...defaultCollection,
  access: { ...defaultCollection.access, create: nobody, update: nobody, delete: nobody },
  admin: { ...defaultCollection.admin, group: false },
  versions: false,
})
