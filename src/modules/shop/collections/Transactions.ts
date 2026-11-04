import { amountField } from '@payloadcms/plugin-ecommerce'
import type { CollectionOverride, CurrenciesConfig } from '@payloadcms/plugin-ecommerce/types'
import type { Field } from 'payload'
import { fieldAffectsData } from 'payload/shared'

const nobody = () => false

/**
 * What the charged `amount` is made of, in cents: the lines at the prices charged (`subtotal`)
 * and the shipping (`shippingAmount`), so `subtotal + shippingAmount === amount` (plan, "Orders").
 * The Stripe wrapper writes both when the payment starts (src/modules/shop/payments/stripe/), and
 * S18 copies them onto the order. Shown like `amount` in the admin (cents as euros), read-only.
 *
 * No validation on purpose: the plugin's settlement updates the transaction, which validates every
 * field again, and nothing may throw during settlement (it would leave the payment stuck). The
 * wrapper only ever writes whole cents.
 */
function breakdownRow(currenciesConfig: CurrenciesConfig): Field {
  return {
    type: 'row',
    admin: { position: 'sidebar' },
    fields: [
      amountField({ currenciesConfig, overrides: { name: 'subtotal', label: { en: 'Subtotal', fr: 'Sous-total' } } }),
      amountField({ currenciesConfig, overrides: { name: 'shippingAmount', label: { en: 'Shipping', fr: 'Livraison' } } }),
    ],
  }
}

/** Whether a field is the sidebar row that holds the plugin's `amount`. */
const holdsAmount = (field: Field) =>
  field.type === 'row' && field.fields.some((inner) => fieldAffectsData(inner) && inner.name === 'amount')

// Transactions: one per payment attempt, written only by the plugin and the Stripe wrapper (both
// pass `overrideAccess`). Read-only for everyone, staff included, and out of the admin navigation;
// the documents still open from an order. No version history (the plugin updates them during
// settlement).
export const transactionsOverride =
  (currenciesConfig: CurrenciesConfig): CollectionOverride =>
  ({ defaultCollection }) => {
    const fields = [...defaultCollection.fields]
    const at = fields.findIndex(holdsAmount)
    fields.splice(at === -1 ? fields.length : at + 1, 0, breakdownRow(currenciesConfig))
    return {
      ...defaultCollection,
      fields,
      access: { ...defaultCollection.access, create: nobody, update: nobody, delete: nobody },
      admin: { ...defaultCollection.admin, group: false },
      versions: false,
    }
  }
