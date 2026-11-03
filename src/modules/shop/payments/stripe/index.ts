/**
 * Spike only (FLU-10): how the built-in Stripe adapter is wrapped so that
 * 1. the charged amount includes a flat shipping fee, and
 * 2. Stripe's `payment_intent.succeeded` webhook creates the order when the
 *    browser never calls `confirm-order`, through the plugin's own idempotent
 *    confirm-order handler (atomic transaction claim, one order, stock once).
 *
 * Experiment switches (env): SPIKE_SHIPPING_CENTS (default 0), SPIKE_WEBHOOK_ORDERS ('1' to enable).
 */
import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'
import { stripeAdapter } from '@payloadcms/plugin-ecommerce/payments/stripe'
import { createPayloadRequest, type PayloadRequest } from 'payload'
import type Stripe from 'stripe'

const CONFIRM_ORDER_PATH = '/payments/stripe/confirm-order'

type WebhookArgs = { event: Stripe.Event; req: PayloadRequest; stripe: Stripe }

/** Webhook handler: settle the order through the plugin's confirm-order handler. */
export const settleFromWebhook = async ({ event, req }: WebhookArgs): Promise<void> => {
  const payload = req.payload
  const paymentIntent = event.data.object as Stripe.PaymentIntent

  const { docs } = await payload.find({
    collection: 'transactions',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    where: { 'stripe.paymentIntentID': { equals: paymentIntent.id } },
  })
  const transaction = docs[0]
  if (!transaction || docs.length !== 1) {
    payload.logger.warn(`[spike webhook] ${event.id}: no single transaction for ${paymentIntent.id}, ignored`)
    return
  }
  if (transaction.status === 'succeeded') {
    payload.logger.info(`[spike webhook] ${event.id}: transaction ${transaction.id} already succeeded, nothing to do`)
    return
  }

  const cartID = paymentIntent.metadata?.cartID
  // The guest cart secret is field-locked; read it at the database layer (trusted server code).
  const cartRow = (await payload.db.findOne({
    collection: 'carts',
    where: { id: { equals: cartID } },
  })) as { secret?: string } | null
  const secret = cartRow?.secret

  const endpoint = payload.config.endpoints.find(
    (e) => e.path === CONFIRM_ORDER_PATH && e.method === 'post',
  )
  if (!endpoint) throw new Error(`confirm-order endpoint ${CONFIRM_ORDER_PATH} not registered`)

  const subReq = await createPayloadRequest({
    payload,
    context: secret ? { cartSecret: secret } : {},
  })
  subReq.data = {
    cartID,
    customerEmail: transaction.customerEmail,
    paymentIntentID: paymentIntent.id,
    ...(secret ? { secret } : {}),
  }

  const response = await endpoint.handler(subReq)
  const body = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    // Throwing makes the webhook endpoint answer 500, so Stripe retries later.
    throw new Error(`[spike webhook] ${event.id}: confirm-order failed (${response.status}) ${JSON.stringify(body)}`)
  }
  payload.logger.info(`[spike webhook] ${event.id}: order ${String(body.orderID)} for transaction ${String(body.transactionID)}`)
}

/**
 * Adds a flat shipping amount (minor units) to what the adapter charges, stores the breakdown
 * (subtotal, shippingAmount) on the transaction at initiate, and passes it into the plugin's
 * finalizeOrder so the order gets it too, on both the browser and the webhook path.
 */
export const withFlatShipping = (adapter: PaymentAdapter, shippingCents: number): PaymentAdapter => ({
  ...adapter,
  initiatePayment: async (args) => {
    const subtotal = args.data.cart.subtotal ?? 0
    const result = await adapter.initiatePayment({
      ...args,
      data: { ...args.data, cart: { ...args.data.cart, subtotal: subtotal + shippingCents } },
    })
    await args.req.payload.update({
      collection: 'transactions',
      overrideAccess: true,
      req: args.req,
      where: { 'stripe.paymentIntentID': { equals: result.paymentIntentID } },
      data: { subtotal, shippingAmount: shippingCents } as never,
    })
    return result
  },
  confirmOrder: (args) =>
    adapter.confirmOrder({
      ...args,
      finalizeOrder: async (finalizeArgs) => {
        const transaction = (await args.req.payload.findByID({
          collection: 'transactions',
          id: finalizeArgs.transactionID,
          depth: 0,
          overrideAccess: true,
          req: args.req,
        })) as { subtotal?: number | null; shippingAmount?: number | null }
        return args.finalizeOrder({
          ...finalizeArgs,
          orderData: {
            ...finalizeArgs.orderData,
            subtotal: transaction.subtotal,
            shippingAmount: transaction.shippingAmount,
          },
        })
      },
    }),
})

export const spikeStripeAdapter = (): PaymentAdapter => {
  const webhookOrders = process.env.SPIKE_WEBHOOK_ORDERS === '1'
  const adapter = stripeAdapter({
    secretKey: process.env.STRIPE_SECRET_KEY!,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOKS_SIGNING_SECRET!,
    webhooks: webhookOrders ? { 'payment_intent.succeeded': settleFromWebhook } : {},
  })
  return withFlatShipping(adapter, Number(process.env.SPIKE_SHIPPING_CENTS || 0))
}
