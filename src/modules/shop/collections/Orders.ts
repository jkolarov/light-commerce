import { randomBytes } from 'node:crypto'

import type { CollectionOverride, CurrenciesConfig } from '@payloadcms/plugin-ecommerce/types'
import type { CollectionBeforeChangeHook, Field, FieldHook } from 'payload'
import { fieldAffectsData } from 'payload/shared'

import { isOwner, isStaffOrOwner } from '@/core/access'

import { confirmationEmailSentAtField } from '../emails/fields'
import { shopGroup } from './admin'
import { afterAmount, breakdownRow, linePricesField } from './breakdown'
import { mapFields } from './fields'
import { buyerLocaleField } from './locale'

// Orders: created by the plugin when a payment is confirmed, never by hand. Staff and owners see
// them in the admin and move them along (paid → shipped, or refunded: the status only, the refund
// itself is done in Stripe). A guest sees their order only through its access token, on the
// confirmation page (src/modules/shop/orders/).
//
// Nothing here may throw while the plugin creates the order (plan, "Orders": a throw in the
// settlement leaves the payment stuck), so no field is `required` and no hook can fail: the access
// token is filled in before validation.

const nobody = () => false

/** 32 random bytes (256 bits), URL-safe: 43 characters. */
export const newAccessToken = () => randomBytes(32).toString('base64url')

/** On create, always a new token, whatever the data said; never changed afterwards. */
const fillAccessToken: FieldHook = ({ operation, value }) => (operation === 'create' ? newAccessToken() : value)

/** An order's date is when it was paid: an update never changes it. */
const keepCreatedAt: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) =>
  operation === 'update' && originalDoc?.createdAt ? { ...data, createdAt: originalDoc.createdAt } : data

const keepStatus: FieldHook = ({ value, originalDoc }) => value || originalDoc?.status || 'processing'

/** What staff may not change on an order: what was bought, paid and promised, and its token. */
const LOCKED = new Set(['items', 'shippingAddress', 'customer', 'customerEmail', 'transactions', 'amount', 'currency'])

function locked(field: Field): Field {
  if (!fieldAffectsData(field) || !LOCKED.has(field.name)) return field
  return { ...field, access: { ...field.access, update: nobody }, admin: { ...field.admin, readOnly: true } } as Field
}

/** The plugin's statuses, plus `shipped`, without `completed`: what a small shop's orders go through. */
function statusField(field: Field): Field {
  if (!fieldAffectsData(field) || field.name !== 'status' || field.type !== 'select') return field
  return {
    ...field,
    // An order always has a status: an empty one keeps the previous status (`processing` on
    // create, which is what the plugin sends). Not `required`: the hook already guarantees it,
    // and nothing may fail validation while the plugin creates an order.
    hooks: { ...field.hooks, beforeValidate: [...(field.hooks?.beforeValidate ?? []), keepStatus] },
    options: [
      // The plugin creates every order as `processing`: it is paid, and waits to be shipped.
      { value: 'processing', label: { en: 'Paid, to ship', fr: 'Payée, à expédier' } },
      { value: 'shipped', label: { en: 'Shipped', fr: 'Expédiée' } },
      { value: 'cancelled', label: { en: 'Cancelled', fr: 'Annulée' } },
      { value: 'refunded', label: { en: 'Refunded (in Stripe)', fr: 'Remboursée (dans Stripe)' } },
    ],
  }
}

function orderFields(currenciesConfig: CurrenciesConfig, defaults: Field[]): Field[] {
  const readOnly = { admin: { readOnly: true, position: 'sidebar' }, access: { update: nobody } } as Partial<Field>
  const attention: Field[] = [
    {
      name: 'needsAttention',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Needs attention', fr: 'À vérifier' },
      admin: {
        position: 'sidebar',
        // A badge in the orders list, instead of true/false (../admin/AttentionCell.tsx).
        components: { Cell: '/modules/shop/admin/AttentionCell#AttentionCell' },
        description: { en: 'Set when something needs you (stock ran out after the payment). Untick it once handled.', fr: 'Cochée quand quelque chose demande votre intervention (stock épuisé après le paiement). Décochez-la une fois réglé.' },
      },
    },
    {
      name: 'attentionNote',
      type: 'textarea',
      label: { en: 'What needs attention', fr: 'Ce qui est à vérifier' },
      admin: { position: 'sidebar', condition: (data) => Boolean(data?.needsAttention || data?.attentionNote) },
    },
  ]
  // The settlement's own mark (wrap.ts): tells the call that created the order from later ones.
  const settlementKey: Field = { name: 'settlementKey', type: 'text', access: { read: isStaffOrOwner, update: nobody }, admin: { hidden: true } }
  const token: Field = {
    name: 'accessToken',
    type: 'text',
    // Staff and owners only, through the API; the admin doesn't show it.
    access: { read: isStaffOrOwner, update: nobody },
    admin: { hidden: true },
    hooks: { beforeValidate: [fillAccessToken] },
  }
  return [
    ...afterAmount(
      mapFields(defaults, (field) => statusField(locked(field))),
      breakdownRow(currenciesConfig, readOnly),
      linePricesField({
        access: { update: nobody },
        label: { en: 'Lines as charged (cents)', fr: 'Lignes facturées (centimes)' },
        admin: { readOnly: true, position: 'sidebar' },
      } as Partial<Field>),
    ),
    ...attention,
    // S19: the buyer's language, and when the order's emails went out.
    buyerLocaleField(),
    confirmationEmailSentAtField(),
    token,
    settlementKey,
  ]
}

export const ordersOverride =
  (currenciesConfig: CurrenciesConfig): CollectionOverride =>
  ({ defaultCollection }) => ({
    ...defaultCollection,
    fields: orderFields(currenciesConfig, defaultCollection.fields),
    access: {
      ...defaultCollection.access,
      // Orders come from payments only (the plugin creates them with `overrideAccess`).
      create: nobody,
      delete: isOwner,
      readVersions: isStaffOrOwner,
    },
    admin: {
      ...defaultCollection.admin,
      group: shopGroup,
      defaultColumns: ['id', 'createdAt', 'customerEmail', 'amount', 'status', 'needsAttention'],
      listSearchableFields: ['customerEmail'],
      // Paid payments that have no order to flag (../admin/FlaggedPayments.tsx).
      components: { ...defaultCollection.admin?.components, beforeListTable: ['/modules/shop/admin/FlaggedPayments#FlaggedPayments'] },
    },
    hooks: { ...defaultCollection.hooks, beforeChange: [...(defaultCollection.hooks?.beforeChange ?? []), keepCreatedAt] },
  })
