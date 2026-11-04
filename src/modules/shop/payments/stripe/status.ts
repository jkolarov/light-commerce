import Stripe from 'stripe'

import { readStripeSettings, type StripeSettings } from './env'

/** Where a payment stands at Stripe, as the checkout needs it. */
export type PaymentOutcome =
  /** Paid: the order exists, or is on its way (the webhook creates it, S18). */
  | 'succeeded'
  /** Accepted, not settled yet (some payment methods take a while): the order comes when it is. */
  | 'processing'
  /** Not paid: declined, abandoned or cancelled. The visitor can try again; nothing was charged. */
  | 'failed'

/**
 * Asks Stripe where a PaymentIntent stands. Used only when the plugin's `confirm-order` did not
 * create the order, to tell "payment received, order pending" from "not paid". Throws when Stripe
 * can't be reached or doesn't know the PaymentIntent.
 */
export async function paymentOutcome(paymentIntentId: string, settings: StripeSettings = readStripeSettings()): Promise<PaymentOutcome> {
  const stripe = new Stripe(settings.secretKey, { appInfo: { name: 'light-commerce' } })
  const { status } = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (status === 'succeeded') return 'succeeded'
  if (status === 'processing') return 'processing'
  return 'failed'
}
