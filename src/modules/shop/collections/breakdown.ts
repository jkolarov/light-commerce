import { amountField } from '@payloadcms/plugin-ecommerce'
import type { CurrenciesConfig } from '@payloadcms/plugin-ecommerce/types'
import type { Field } from 'payload'
import { fieldAffectsData } from 'payload/shared'

// What a payment's `amount` is made of, on transactions (written by the Stripe wrapper when the
// payment starts) and orders (copied from the transaction when the order is created): plan,
// "Orders". All in cents. `subtotal + shippingAmount === amount`.
//
// No validation on purpose: the plugin's settlement updates transactions and creates orders, both
// validated again, and nothing may throw during settlement (it would leave the payment stuck).
// The wrapper only ever writes whole cents.

/** One line as it was charged: the plugin's lines (`items`) carry no prices. */
export type LinePrice = { product: number | string; quantity: number; unitPrice: number; lineTotal: number }

/** `subtotal` and `shippingAmount`, shown like `amount` (cents as euros), in the sidebar. */
export function breakdownRow(currenciesConfig: CurrenciesConfig, overrides: Partial<Field> = {}): Field {
  const money = (name: string, label: { en: string; fr: string }) =>
    amountField({ currenciesConfig, overrides: { name, label, ...(overrides as object) } })
  return {
    type: 'row',
    admin: { position: 'sidebar' },
    fields: [money('subtotal', { en: 'Subtotal', fr: 'Sous-total' }), money('shippingAmount', { en: 'Shipping', fr: 'Livraison' })],
  }
}

/** `linePrices`: each line's unit price and total when it was charged (JSON, out of the admin). */
export const linePricesField = (overrides: Partial<Field> = {}): Field =>
  ({ name: 'linePrices', type: 'json', admin: { hidden: true }, ...overrides }) as Field

/** `linePrices` as stored, or `[]` when it is missing or not what the wrapper writes. */
export function readLinePrices(value: unknown): LinePrice[] {
  if (!Array.isArray(value)) return []
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0
  return value.filter(
    (line): line is LinePrice =>
      !!line &&
      typeof line === 'object' &&
      (typeof line.product === 'number' || typeof line.product === 'string') &&
      whole(line.quantity) &&
      whole(line.unitPrice) &&
      whole(line.lineTotal),
  )
}

/** `fields` with `added` placed right after the sidebar row that holds the plugin's `amount`. */
export function afterAmount(fields: Field[], ...added: Field[]): Field[] {
  const at = fields.findIndex((field) => field.type === 'row' && field.fields.some((inner) => fieldAffectsData(inner) && inner.name === 'amount'))
  const copy = [...fields]
  copy.splice(at === -1 ? copy.length : at + 1, 0, ...added)
  return copy
}
