import { createPayloadRequest, type Payload } from 'payload'

import type { Transaction } from '@/payload-types'

import type { CartRef } from '../../cart/load'
import { checkoutContext, CHECKOUT_CONTEXT, type CheckoutContext, type PaymentRefusal } from './wrap'

// What the checkout asks of Stripe, through the ecommerce plugin's own endpoints rather than
// around them: `initiate` (reads the cart by id and secret, checks stock, then runs the wrapped
// adapter) and `confirm-order` (claims the transaction atomically and creates the order once,
// whoever calls it: the browser's return, or S18's webhook). The handlers are found in the
// Payload config and called in-process, with the cart from the visitor's cookie.
//
// Plugin internals relied on here (re-check on every plugin upgrade): the handlers' paths, and
// that they read `req.data` as `{ cartID, secret, customerEmail, ... }` when the request has no body.

const METHOD_PATH = '/payments/stripe'

type Call = { status: number; body: Record<string, unknown>; context: CheckoutContext }

async function callPluginEndpoint(payload: Payload, name: 'initiate' | 'confirm-order', data: Record<string, unknown>, context: CheckoutContext = {}): Promise<Call> {
  const path = `${METHOD_PATH}/${name}`
  const endpoint = payload.config.endpoints.find((candidate) => candidate.path === path && candidate.method === 'post')
  if (!endpoint) throw new Error(`The ecommerce plugin's ${path} endpoint is not registered: is the Stripe payment method on?`)
  const req = await createPayloadRequest({ payload, context: { [CHECKOUT_CONTEXT]: context } })
  req.data = data
  const response = await endpoint.handler(req)
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { status: response.status, body, context: checkoutContext(req) }
}

/** A shipping (and billing) address, in the plugin's address fields. */
export type PaymentAddress = {
  firstName: string
  lastName: string
  addressLine1: string
  addressLine2?: string
  postalCode: string
  city: string
  /** ISO 3166-1 alpha-2, capitals. */
  country: string
  phone?: string
}

export type PaymentStart =
  | { ok: true; clientSecret: string; paymentIntentId: string }
  /** Why the wrapper refused (`PaymentRefusal`), or `failed` for anything else. */
  | { ok: false; reason: PaymentRefusal | 'failed'; status: number; message?: string }

/**
 * Starts a Stripe payment for the guest's cart: a PaymentIntent for the cart's price today plus
 * shipping (the wrapper's rules), and its pending transaction. `expectedTotal` is the total the
 * visitor was shown: a cart that costs anything else is refused, never charged.
 */
export async function startStripePayment(
  payload: Payload,
  input: { cart: CartRef; customerEmail: string; address: PaymentAddress; expectedTotal: number },
): Promise<PaymentStart> {
  const { status, body, context } = await callPluginEndpoint(
    payload,
    'initiate',
    {
      cartID: input.cart.id,
      secret: input.cart.secret,
      customerEmail: input.customerEmail,
      shippingAddress: input.address,
      billingAddress: input.address,
    },
    { expectedTotal: input.expectedTotal },
  )
  const { clientSecret, paymentIntentID } = body
  if (status === 200 && typeof clientSecret === 'string' && clientSecret && typeof paymentIntentID === 'string') {
    return { ok: true, clientSecret, paymentIntentId: paymentIntentID }
  }
  const message = typeof body.message === 'string' ? body.message : undefined
  return { ok: false, reason: context.refused ?? 'failed', status, message }
}

export type PaymentConfirmation =
  | { ok: true; orderId: number | string; accessToken: string | null }
  | { ok: false; status: number }

/**
 * Settles a payment through the plugin's `confirm-order`: it checks the PaymentIntent at Stripe
 * (succeeded, same amount, cart and email), then creates the order, marks the cart bought and
 * lowers the stock, once. Calling it again returns the same order. Not ok when the payment did not
 * succeed, or settlement is still running elsewhere (the plugin waits 500 ms, then answers 500).
 */
export async function confirmStripePayment(
  payload: Payload,
  input: { cart: CartRef; customerEmail: string; paymentIntentId: string },
): Promise<PaymentConfirmation> {
  const { status, body } = await callPluginEndpoint(payload, 'confirm-order', {
    cartID: input.cart.id,
    secret: input.cart.secret,
    customerEmail: input.customerEmail,
    paymentIntentID: input.paymentIntentId,
  })
  const { orderID, accessToken } = body
  if (status === 200 && (typeof orderID === 'number' || (typeof orderID === 'string' && orderID))) {
    // `accessToken` comes once orders have one (S18).
    return { ok: true, orderId: orderID, accessToken: typeof accessToken === 'string' && accessToken ? accessToken : null }
  }
  return { ok: false, status }
}

/** A PaymentIntent's ID as Stripe writes it (`pi_` and letters or digits); anything else is no payment. */
export const isPaymentIntentId = (value: unknown): value is string => typeof value === 'string' && /^pi_[A-Za-z0-9]{1,250}$/.test(value)

/** The transaction of a PaymentIntent, or `null` unless there is exactly one. Trusted server code. */
export async function findPaymentTransaction(payload: Payload, paymentIntentId: string): Promise<Transaction | null> {
  const { docs } = await payload.find({
    collection: 'transactions',
    where: { 'stripe.paymentIntentID': { equals: paymentIntentId } },
    depth: 0,
    limit: 2,
    pagination: false,
    overrideAccess: true,
  })
  return docs.length === 1 ? docs[0]! : null
}
