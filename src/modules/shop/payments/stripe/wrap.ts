import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'
import type { PayloadRequest } from 'payload'

import { priceGuestCart } from '../../cart/load'
import type { CartPricing } from '../../cart/price'

// The wrapper around the ecommerce plugin's Stripe adapter (plan, "Cart (S16)" and "Orders"). The
// built-in `initiatePayment` charges whatever `data.cart.subtotal` it is handed: the cart's stored
// subtotal, which the plugin wrote at the last cart change. That goes stale after a price change,
// counts a line whose price was switched off, has no shipping, and holds whatever a broken write
// left there. So, before the inner adapter runs:
//
// - the cart is priced again with `priceGuestCart`: its products as visitors read them now, at
//   today's stored prices, plus `calculateShipping` (the same rules as the cart page);
// - it is refused unless it can check out (empty, a line no longer for sale, sold out, over the
//   stock across its lines, a bad quantity), and, when the checkout passed the total it showed the
//   visitor, unless that total is still the one charged;
// - the inner adapter is handed `total` as the subtotal, so that is what the PaymentIntent charges.
//
// Afterwards the transaction gets `subtotal` and `shippingAmount` (subtotal + shippingAmount ===
// amount), and the update must have matched exactly one transaction. Nothing the browser sends is
// used for the amount: the plugin's `initiate` endpoint reads the cart itself, by id and secret.
//
// `confirmOrder` is the inner one for now. S18 wraps it (stock check, copying the breakdown onto
// the order) and adds the webhook that settles a payment when the browser never comes back.

/** The key in `req.context` where the checkout and the wrapper meet. */
export const CHECKOUT_CONTEXT = 'lightCheckout'

export type CheckoutContext = {
  /** The total the visitor was shown, in cents. When set, any other total is refused, never charged. */
  expectedTotal?: number
  /**
   * Set by the wrapper when it refuses a payment. The plugin's endpoint answers a bare 500 for
   * anything the adapter throws, so this is how the checkout learns why.
   */
  refused?: 'cartChanged'
}

/** The checkout's context on this request, created when missing. */
export function checkoutContext(req: Pick<PayloadRequest, 'context'>): CheckoutContext {
  const existing = req.context[CHECKOUT_CONTEXT]
  if (existing && typeof existing === 'object') return existing as CheckoutContext
  const created: CheckoutContext = {}
  req.context[CHECKOUT_CONTEXT] = created
  return created
}

/** A payment the wrapper would not start. Nothing was charged and no PaymentIntent exists. */
export class PaymentRefusedError extends Error {
  override name = 'PaymentRefusedError'
}

/** Wraps a payment adapter so it charges the cart's price today, shipping included (see above). */
export function withServerPricing(inner: PaymentAdapter): PaymentAdapter {
  return {
    ...inner,
    initiatePayment: async (args) => {
      const { req } = args
      const context = checkoutContext(req)
      const refuse = (why: string): never => {
        context.refused = 'cartChanged'
        throw new PaymentRefusedError(why)
      }

      const pricing = await priceGuestCart(req.payload, args.data.cart)
      if (!pricing.canCheckout) refuse(`Cart ${String(args.data.cart.id)} cannot check out as it is.`)
      if (context.expectedTotal !== undefined && context.expectedTotal !== pricing.total) {
        refuse(`Cart ${String(args.data.cart.id)} now costs ${pricing.total}, not the ${context.expectedTotal} shown.`)
      }

      const result = await inner.initiatePayment({
        ...args,
        data: { ...args.data, cart: { ...args.data.cart, subtotal: pricing.total } },
      })
      await storeBreakdown(req, result.paymentIntentID, pricing)
      return result
    },
  }
}

/** Writes `subtotal` and `shippingAmount` on the payment's transaction, which must be exactly one. */
async function storeBreakdown(req: PayloadRequest, paymentIntentID: unknown, pricing: CartPricing): Promise<void> {
  if (typeof paymentIntentID !== 'string' || !paymentIntentID) {
    throw new Error('The Stripe adapter returned no PaymentIntent ID.')
  }
  // Transactions are read-only for everyone (collections/Transactions.ts): trusted server code.
  const { docs, errors } = await req.payload.update({
    collection: 'transactions',
    where: { 'stripe.paymentIntentID': { equals: paymentIntentID } },
    data: { subtotal: pricing.subtotal, shippingAmount: pricing.shipping },
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (docs.length !== 1 || errors.length > 0) {
    throw new Error(`Expected one transaction for PaymentIntent ${paymentIntentID}, updated ${docs.length}.`)
  }
}
