import type { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'

import { isStaffOrOwner } from '@/core/access'

import { shopGroup } from './admin'

// Orders: created by the plugin when a payment is confirmed. Staff and owners manage them; a
// guest sees their order only through its access token (S18). S18 adds `accessToken`,
// `subtotal`, `shippingAmount`, `needsAttention` and `attentionNote` here (plan, "Orders").
export const ordersOverride: CollectionOverride = ({ defaultCollection }) => ({
  ...defaultCollection,
  access: { ...defaultCollection.access, readVersions: isStaffOrOwner },
  admin: { ...defaultCollection.admin, group: shopGroup },
})
