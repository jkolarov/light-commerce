import { createHmac } from 'node:crypto'

import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'

import type { Transaction } from '@/payload-types'

import recorded from '../fixtures/stripe/payment_intent.succeeded.json'

// Stripe, stood in for at the wrapper's boundary (no test calls Stripe). The plugin's built-in
// Stripe adapter keeps its config (the `stripe` group with the shop's unique index), but its two
// calls to Stripe are replaced by fakes that behave like it:
// - `initiatePayment` "charges" whatever `data.cart.subtotal` it is handed and writes the same
//   pending transaction, copying every property of a line (its id included);
// - `confirmOrder` checks the PaymentIntent the way the real one does (one transaction, same
//   amount, status succeeded), then calls the plugin's `finalizeOrder` with the same order data.
// So what the fake "charges" is what Stripe would, and settlement runs the plugin's real claim.
//
// In a test file:
//   vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (original) =>
//     (await import('../support/stripe')).fakeStripeAdapterModule(await original()))
//   vi.mock('@/modules/shop/payments/stripe/status', async () => (await import('../support/stripe')).fakeStatusModule())
// and boot Payload with `STRIPE_TEST_ENV`, so the webhook endpoint checks signatures.

export type FakeIntent = { amount: number; status: string; items: unknown[]; shippingAddress: unknown }

export const stripe = {
  intents: new Map<string, FakeIntent>(),
  next: 0,
  /** Makes `confirmOrder` fail after the payment succeeded (settlement trouble). */
  breakSettlement: false,
  /** How many times the plugin's `confirm-order` reached the adapter. */
  confirmCalls: 0,
  /** The PaymentIntent of the last payment started. */
  last(): string {
    return [...this.intents.keys()].at(-1)!
  },
  /** Marks a PaymentIntent paid at "Stripe". */
  pay(id: string) {
    this.intents.get(id)!.status = 'succeeded'
  },
}

/** Placeholder keys: the webhook endpoint checks signatures with the signing secret. Nothing calls Stripe. */
export const STRIPE_TEST_ENV = { STRIPE_SECRET_KEY: 'test-placeholder-secret', STRIPE_WEBHOOKS_SIGNING_SECRET: 'test-placeholder-signing' }

type InitiateArgs = Parameters<PaymentAdapter['initiatePayment']>[0]
type ConfirmArgs = Parameters<PaymentAdapter['confirmOrder']>[0]

export function fakeStripeAdapterModule(original: unknown) {
  const real = original as { stripeAdapter: (props: unknown) => PaymentAdapter }
  return {
    ...real,
    stripeAdapter: (props: unknown): PaymentAdapter => ({
      ...real.stripeAdapter(props),
      initiatePayment: async ({ data, req, transactionsSlug }: InitiateArgs) => {
        const id = `pi_fake${++stripe.next}`
        const amount = data.cart.subtotal as number
        const items = data.cart.items.map(({ product, variant: _variant, ...rest }) => ({ ...rest, product: typeof product === 'object' ? product.id : product }))
        stripe.intents.set(id, { amount, status: 'requires_payment_method', items, shippingAddress: data.shippingAddress })
        await req.payload.create({
          collection: transactionsSlug as 'transactions',
          data: {
            customerEmail: data.customerEmail,
            amount,
            billingAddress: data.billingAddress,
            cart: data.cart.id as number,
            currency: 'EUR',
            items: items as Transaction['items'],
            paymentMethod: 'stripe',
            status: 'pending',
            stripe: { customerID: 'cus_fake', paymentIntentID: id },
          },
          overrideAccess: true,
          req,
        })
        return { clientSecret: `${id}_secret_fake`, message: 'Payment initiated successfully', paymentIntentID: id }
      },
      confirmOrder: async ({ data, finalizeOrder, req, transactionsSlug }: ConfirmArgs) => {
        stripe.confirmCalls++
        const intent = stripe.intents.get(data.paymentIntentID)
        const { docs } = await req.payload.find({
          collection: transactionsSlug as 'transactions',
          where: { 'stripe.paymentIntentID': { equals: data.paymentIntentID } },
          depth: 0,
          overrideAccess: true,
          req,
        })
        const transaction = docs[0]
        if (!intent || docs.length !== 1 || !transaction) throw new Error('Expected exactly one transaction')
        if (intent.amount !== transaction.amount) throw new Error('Stripe amount does not match the transaction amount')
        if (intent.status !== 'succeeded') throw new Error('Payment not completed.')
        if (stripe.breakSettlement) throw new Error('Something broke during settlement')
        const order = await finalizeOrder({
          orderData: { amount: transaction.amount, currency: transaction.currency, customerEmail: data.customerEmail, items: intent.items, shippingAddress: intent.shippingAddress, status: 'processing' },
          transactionID: transaction.id,
        })
        return {
          message: 'Order confirmed',
          orderID: order.id as number,
          transactionID: transaction.id,
          ...(typeof order.accessToken === 'string' ? { accessToken: order.accessToken } : {}),
        }
      },
    }),
  }
}

/** Where a PaymentIntent stands at "Stripe", for the return path and the reconcile job. */
export function fakeStatusModule() {
  return {
    paymentOutcome: async (id: string) => {
      const status = stripe.intents.get(id)?.status
      if (!status) throw new Error(`No such PaymentIntent: ${id}`)
      return status === 'succeeded' ? 'succeeded' : status === 'processing' ? 'processing' : 'failed'
    },
  }
}

/**
 * A `payment_intent.succeeded` event as Stripe sends it (recorded in test mode,
 * tests/fixtures/stripe/), for `paymentIntentId`.
 */
export function succeededEvent(paymentIntentId: string, eventId = `evt_${paymentIntentId}`): string {
  const event = structuredClone(recorded) as typeof recorded
  event.id = eventId
  event.data.object.id = paymentIntentId
  return JSON.stringify(event)
}

/** The `stripe-signature` header Stripe sends: `t=<seconds>,v1=<HMAC-SHA256 of "<t>.<body>">`. */
export function stripeSignature(body: string, secret = STRIPE_TEST_ENV.STRIPE_WEBHOOKS_SIGNING_SECRET, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`
}
