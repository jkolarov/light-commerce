import { createHmac, randomBytes } from 'node:crypto'

import type { APIRequestContext } from '@playwright/test'

import type { Transaction } from './admin'
import { e2e } from './env'

// Stripe's webhook, sent by the test itself: signed like Stripe's (`t=<time>,v1=<HMAC-SHA256 of
// "<time>.<body>">`, with this run's signing secret), or forged.

export type PaymentIntentObject = {
  id: string
  amount: number
  currency: string
  customer: string
  metadata: Record<string, string>
}

/** A `payment_intent.succeeded` event, as Stripe sends it (the parts the shop may read). */
export function paymentSucceededEvent(paymentIntent: PaymentIntentObject) {
  return {
    id: `evt_e2e${randomBytes(10).toString('hex')}`,
    object: 'event',
    created: Math.floor(Date.now() / 1000),
    data: { object: { ...paymentIntent, object: 'payment_intent', amount_received: paymentIntent.amount, status: 'succeeded', livemode: false } },
    livemode: false,
    type: 'payment_intent.succeeded',
  }
}

/**
 * How the request is signed: `valid`, or forged: no `stripe-signature` header, signed with another
 * secret, or a valid signature over another body (the body was changed on the way).
 */
export type Signing = 'valid' | 'missing' | 'wrongSecret' | 'tamperedBody'

const sign = (secret: string, body: string) => {
  const time = Math.floor(Date.now() / 1000)
  return `t=${time},v1=${createHmac('sha256', secret).update(`${time}.${body}`).digest('hex')}`
}

/** Posts an event to the shop's Stripe webhook. Answers the HTTP status. */
export async function postWebhook(request: APIRequestContext, event: object, signing: Signing = 'valid'): Promise<number> {
  const body = JSON.stringify(event)
  const signature = {
    valid: () => sign(e2e.signingSecret, body),
    missing: () => null,
    wrongSecret: () => sign(`not-${e2e.signingSecret}`, body),
    tamperedBody: () => sign(e2e.signingSecret, JSON.stringify({ ...event, livemode: true })),
  }[signing]()
  const response = await request.post(e2e.webhookPath, {
    data: body,
    headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) },
  })
  return response.status()
}

/** What Stripe does when it retries an event: `payment_intent.succeeded` again, for a paid transaction. */
export function resendPaymentSucceeded(request: APIRequestContext, transaction: Transaction): Promise<number> {
  return postWebhook(
    request,
    paymentSucceededEvent({
      id: transaction.stripe.paymentIntentID,
      amount: transaction.amount,
      currency: transaction.currency.toLowerCase(),
      customer: transaction.stripe.customerID,
      metadata: { cartID: String(transaction.cart) },
    }),
  )
}
