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
  /** Stripe doesn't know this PaymentIntent (another Stripe account, or a made-up id). */
  | 'unknown'

/**
 * Asks Stripe where a PaymentIntent stands: for the browser's return, to tell "payment received"
 * from "not paid", and for the reconcile job. Throws when Stripe can't be reached.
 */
export async function paymentOutcome(paymentIntentId: string, settings: StripeSettings = readStripeSettings()): Promise<PaymentOutcome> {
  const stripe = new Stripe(settings.secretKey, { appInfo: { name: 'light-commerce' } })
  let status: Stripe.PaymentIntent.Status
  try {
    ;({ status } = await stripe.paymentIntents.retrieve(paymentIntentId))
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') return 'unknown'
    throw error
  }
  if (status === 'succeeded') return 'succeeded'
  if (status === 'processing') return 'processing'
  return 'failed'
}

/** Where a PaymentIntent stands once `closeOpenPaymentIntent` is done with it. */
export type ClosedPaymentIntent = 'succeeded' | 'processing' | 'canceled' | 'unknown'

/**
 * For a script about to delete a payment's transaction (the demo's nightly reset): cancels the
 * PaymentIntent at Stripe if it can still be paid (`requires_*`), so nobody pays it afterwards
 * with no transaction left to make the order from. Paid (`succeeded`) and settling (`processing`)
 * ones are left alone and said so. Throws when Stripe can't be reached or refuses the cancel.
 */
export async function closeOpenPaymentIntent(paymentIntentId: string, settings: StripeSettings = readStripeSettings()): Promise<ClosedPaymentIntent> {
  const stripe = new Stripe(settings.secretKey, { appInfo: { name: 'light-commerce' } })
  let status: Stripe.PaymentIntent.Status
  try {
    ;({ status } = await stripe.paymentIntents.retrieve(paymentIntentId))
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') return 'unknown'
    throw error
  }
  if (status === 'succeeded' || status === 'processing' || status === 'canceled') return status
  await stripe.paymentIntents.cancel(paymentIntentId)
  return 'canceled'
}
