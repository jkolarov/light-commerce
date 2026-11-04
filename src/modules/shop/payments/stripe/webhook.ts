import type { Endpoint, PayloadRequest } from 'payload'
import Stripe from 'stripe'

import { finalizePayment, OrderDeletedError, UnknownPaymentError } from '../../orders/finalizePayment'
import type { StripeSettings } from './env'

// Stripe's webhook, `POST /api/payments/stripe/webhooks`: it replaces the built-in adapter's,
// which answers 200 and drops the event when the request has no `stripe-signature` header (plan,
// "Orders"). Here:
//
// - no signature, or a bad one: 400, nothing read or written;
// - `payment_intent.succeeded`: `finalizePayment` creates the order unless it exists (the browser
//   may never come back), then 200. A payment the shop didn't start (another app on the same
//   Stripe account), or one whose order the owner deleted since: 200, ignored. Anything else that
//   goes wrong: 500, so Stripe sends the event
//   again later (it retries for days), and `finalizePayment` is idempotent;
// - every other event: 200, ignored.

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status })

export function webhookEndpoint(settings: StripeSettings): Endpoint {
  return {
    path: '/webhooks',
    method: 'post',
    handler: async (req: PayloadRequest) => {
      const { payload } = req
      const signature = req.headers.get('stripe-signature')
      if (!signature) return answer(400, { error: 'Missing the stripe-signature header.' })
      if (!settings.secretKey || !settings.webhookSecret || !req.text) {
        payload.logger.error({ msg: 'Shop: a Stripe webhook arrived, but the Stripe keys are not set.' })
        return answer(500, { error: 'Payments are not configured.' })
      }

      let event: Stripe.Event
      try {
        event = new Stripe(settings.secretKey).webhooks.constructEvent(await req.text(), signature, settings.webhookSecret)
      } catch (error) {
        payload.logger.warn({ msg: `Shop: refused a Stripe webhook with a bad signature (${error instanceof Error ? error.message : 'unknown'}).` })
        return answer(400, { error: 'Bad signature.' })
      }
      if (event.type !== 'payment_intent.succeeded') return answer(200, { received: true })

      const paymentIntentId = event.data.object.id
      try {
        const { order } = await finalizePayment(payload, paymentIntentId)
        payload.logger.info({ msg: `Shop: webhook ${event.id}: order ${order.id} for PaymentIntent ${paymentIntentId}.` })
        return answer(200, { received: true })
      } catch (error) {
        if (error instanceof UnknownPaymentError || error instanceof OrderDeletedError) {
          payload.logger.info({ msg: `Shop: webhook ${event.id}: ignored (${error.message})` })
          return answer(200, { received: true, ignored: true })
        }
        payload.logger.error({ err: error, msg: `Shop: webhook ${event.id}: could not settle PaymentIntent ${paymentIntentId}; Stripe will send it again.` })
        return answer(500, { error: 'Could not settle the payment yet.' })
      }
    },
  }
}
