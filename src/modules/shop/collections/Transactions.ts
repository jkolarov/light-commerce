import type { CollectionOverride, CurrenciesConfig } from '@payloadcms/plugin-ecommerce/types'
import type { Field } from 'payload'
import { fieldAffectsData } from 'payload/shared'

import { mapFields } from './fields'
import { afterAmount, breakdownRow, linePricesField } from './breakdown'
import { buyerLocaleField } from './locale'

const nobody = () => false

/** The few labels of the plugin's transaction fields that it only writes in English. */
const LABELS: Record<string, { en: string; fr: string }> = {
  cart: { en: 'Cart', fr: 'Panier' },
  stripe: { en: 'Stripe', fr: 'Stripe' },
  customerID: { en: 'Stripe customer ID', fr: 'ID client Stripe' },
  paymentIntentID: { en: 'Stripe PaymentIntent ID', fr: 'ID PaymentIntent Stripe' },
}

function frenchLabels(field: Field): Field {
  return fieldAffectsData(field) && field.name in LABELS ? ({ ...field, label: LABELS[field.name] } as Field) : field
}

// Transactions: one per payment attempt, written only by the plugin and the Stripe wrapper (both
// pass `overrideAccess`). Read-only for everyone, staff included, and out of the admin navigation;
// the documents still open from an order. No version history (the plugin updates them during
// settlement). The wrapper adds what the amount is made of (./breakdown.ts) when the payment starts.
export const transactionsOverride =
  (currenciesConfig: CurrenciesConfig): CollectionOverride =>
  ({ defaultCollection }) => ({
    ...defaultCollection,
    fields: [
      ...afterAmount(mapFields(defaultCollection.fields, frenchLabels), breakdownRow(currenciesConfig), linePricesField()),
      // Set once by the reconcile job (orders/reconcile.ts) when a payment can never be settled
      // here; the job doesn't look at it again.
      {
        name: 'attentionNote',
        type: 'textarea',
        label: { en: 'What needs attention', fr: 'Ce qui est à vérifier' },
        admin: { position: 'sidebar', condition: (data) => Boolean(data?.attentionNote) },
      },
      buyerLocaleField(),
    ],
    access: { ...defaultCollection.access, create: nobody, update: nobody, delete: nobody },
    admin: { ...defaultCollection.admin, group: false },
    versions: false,
  })
