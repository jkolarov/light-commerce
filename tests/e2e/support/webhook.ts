import { createHmac, randomBytes } from 'node:crypto'

import type { APIRequestContext } from '@playwright/test'

import type { Transaction } from './admin'
import { e2e } from './env'

/**
 * Sends the shop's Stripe webhook a `payment_intent.succeeded` for a paid transaction again, signed
 * like Stripe's (`t=<time>,v1=<HMAC-SHA256>`, with this run's signing secret): what Stripe does
 * when it retries an event. Answers the webhook's HTTP status.
 */
export async function resendPaymentSucceeded(request: APIRequestContext, transaction: Transaction): Promise<number> {
  const paymentIntent = {
    id: transaction.stripe.paymentIntentID,
    object: 'payment_intent',
    amount: transaction.amount,
    amount_received: transaction.amount,
    currency: transaction.currency.toLowerCase(),
    customer: transaction.stripe.customerID,
    metadata: { cartID: String(transaction.cart) },
    status: 'succeeded',
    livemode: false,
  }
  const event = {
    id: `evt_e2e${randomBytes(10).toString('hex')}`,
    object: 'event',
    created: Math.floor(Date.now() / 1000),
    data: { object: paymentIntent },
    livemode: false,
    type: 'payment_intent.succeeded',
  }
  const body = JSON.stringify(event)
  const time = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', e2e.signingSecret).update(`${time}.${body}`).digest('hex')
  const response = await request.post(e2e.webhookPath, {
    data: body,
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${time},v1=${v1}` },
  })
  return response.status()
}
