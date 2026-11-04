import type { CollectionOverride, CurrenciesConfig } from '@payloadcms/plugin-ecommerce/types'

import { afterAmount, breakdownRow, linePricesField } from './breakdown'

const nobody = () => false

// Transactions: one per payment attempt, written only by the plugin and the Stripe wrapper (both
// pass `overrideAccess`). Read-only for everyone, staff included, and out of the admin navigation;
// the documents still open from an order. No version history (the plugin updates them during
// settlement). The wrapper adds what the amount is made of (./breakdown.ts) when the payment starts.
export const transactionsOverride =
  (currenciesConfig: CurrenciesConfig): CollectionOverride =>
  ({ defaultCollection }) => ({
    ...defaultCollection,
    fields: [
      ...afterAmount(defaultCollection.fields, breakdownRow(currenciesConfig), linePricesField()),
      // Set once by the reconcile job (orders/reconcile.ts) when a payment can never be settled
      // here; the job doesn't look at it again.
      {
        name: 'attentionNote',
        type: 'textarea',
        label: { en: 'What needs attention', fr: 'Ce qui est à vérifier' },
        admin: { position: 'sidebar', condition: (data) => Boolean(data?.attentionNote) },
      },
    ],
    access: { ...defaultCollection.access, create: nobody, update: nobody, delete: nobody },
    admin: { ...defaultCollection.admin, group: false },
    versions: false,
  })
