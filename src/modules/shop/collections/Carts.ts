import type { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'
import type { Field } from 'payload'
import { fieldAffectsData } from 'payload/shared'

import { isStaffOrOwner } from '@/core/access'

import { hiddenFromAdmin } from './admin'

// Carts: the plugin's own collection, for guests (reached with the cart's `secret`).
// Hidden from the admin; versions off, because every cart change would otherwise add one.

/**
 * Fields a guest must not set on their own cart: who it belongs to, and when it was bought. The
 * plugin sets `purchasedAt` itself when an order is confirmed (with `overrideAccess`).
 */
const STAFF_ONLY_FIELDS = ['customer', 'purchasedAt']

export const cartsOverride: CollectionOverride = async (args) => {
  const carts = await hiddenFromAdmin(args)
  return {
    ...carts,
    fields: carts.fields.map((field): Field =>
      fieldAffectsData(field) && STAFF_ONLY_FIELDS.includes(field.name)
        ? ({ ...field, access: { ...field.access, create: isStaffOrOwner, update: isStaffOrOwner } } as Field)
        : field,
    ),
  }
}
