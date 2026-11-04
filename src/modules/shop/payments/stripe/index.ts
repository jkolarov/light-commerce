import { stripeAdapter } from '@payloadcms/plugin-ecommerce/payments/stripe'
import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'
import type { Field } from 'payload'

import { readStripeSettings, type StripeSettings } from './env'
import { withCheckoutRules } from './wrap'

// The shop's Stripe payment method: the ecommerce plugin's built-in Stripe adapter, wrapped
// (./wrap.ts). This folder is the only place that talks to Stripe (design 4.8; ESLint enforces it).
// Card fields are drawn by Stripe's Payment Element in the browser (./usePaymentElement.ts): card
// data never reaches this server.
//
// The plugin registers the adapter's endpoints under /api/payments/stripe: `initiate`,
// `confirm-order` and `webhooks`. Server code reaches the first two through ./payments.ts.

/** One transaction per PaymentIntent, enforced by the database (a unique index). */
const uniquePaymentIntent = (field: Field): Field =>
  'name' in field && field.name === 'paymentIntentID' ? ({ ...field, unique: true } as Field) : field

/** The Stripe payment method for `ecommercePlugin({ payments: { paymentMethods } })`. */
export function stripePaymentMethod(settings: StripeSettings = readStripeSettings()): PaymentAdapter {
  const adapter = stripeAdapter({
    secretKey: settings.secretKey,
    publishableKey: settings.publishableKey,
    webhookSecret: settings.webhookSecret,
    // S18 adds `payment_intent.succeeded`, so an order exists even when the browser never returns.
    webhooks: {},
    groupOverrides: { fields: ({ defaultFields }) => defaultFields.map(uniquePaymentIntent) },
  })
  return withCheckoutRules(adapter)
}
