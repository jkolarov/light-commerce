import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'

import { cartPath } from '../cart/paths'
import type { CartRef } from '../cart/load'
import { confirmStripePayment, findPaymentTransaction, isPaymentIntentId } from '../payments/stripe/payments'
import { paymentOutcome } from '../payments/stripe/status'
import { orderPath, paymentFailedPath, paymentReceivedPath } from './paths'

// The browser's way back after a payment: Stripe's return URL, and where the form sends the
// browser once a card payment went through. It settles the payment through the plugin's
// `confirm-order` (via the Stripe wrapper's `confirmOrder`, the same one S18's webhook uses), so
// an order is created once, whichever comes first.
//
// Settlement rule (plan, "Orders"): when `confirm-order` does not answer with an order after a
// payment that succeeded, that is "payment received, order pending", never "payment failed". The
// webhook (S18) creates the order. The visitor sees a calm "payment received" page.

export type CheckoutOutcome =
  | { kind: 'order'; orderId: number | string; accessToken: string | null }
  /** Paid (or being settled by Stripe), and the order is on its way. */
  | { kind: 'received' }
  /** The server could not tell: the payment may have gone through. */
  | { kind: 'checking' }
  /** Not paid: the visitor can try again, the cart is as it was. */
  | { kind: 'failed' }
  /** Not a payment of this shop. */
  | { kind: 'unknown' }

/** Whether the browser holds the payment's cart: the cookie's cart, with its secret (bought or not). */
async function holdsCart(payload: Payload, ref: CartRef, transactionCart: unknown): Promise<boolean> {
  const cartId = transactionCart && typeof transactionCart === 'object' ? (transactionCart as { id?: unknown }).id : transactionCart
  if (String(cartId) !== String(ref.id)) return false
  const cart = await payload.findByID({
    collection: 'carts',
    id: ref.id,
    depth: 0,
    overrideAccess: false,
    context: { cartSecret: ref.secret },
    disableErrors: true,
    select: { purchasedAt: true },
  })
  return Boolean(cart)
}

/** The order's access token (S18 adds the field), or `null`. */
async function accessTokenOf(payload: Payload, orderId: unknown): Promise<string | null> {
  const order = await payload.findByID({ collection: 'orders', id: orderId as number, depth: 0, overrideAccess: true, disableErrors: true })
  const token = (order as { accessToken?: unknown } | null)?.accessToken
  return typeof token === 'string' && token ? token : null
}

/**
 * Settles the payment `paymentIntentId` (from the return URL) for the browser holding `cart`.
 * Only a browser holding the payment's cart learns about the order; any other learns only whether
 * the payment went through.
 */
export async function confirmCheckout(payload: Payload, input: { paymentIntentId: unknown; cart: CartRef | null }): Promise<CheckoutOutcome> {
  const { paymentIntentId, cart } = input
  if (!isPaymentIntentId(paymentIntentId)) return { kind: 'unknown' }
  const transaction = await findPaymentTransaction(payload, paymentIntentId)
  if (!transaction) return { kind: 'unknown' }

  if (cart && (await holdsCart(payload, cart, transaction.cart))) {
    if (transaction.status === 'succeeded' && transaction.order) {
      const orderId = typeof transaction.order === 'object' ? transaction.order.id : transaction.order
      return { kind: 'order', orderId, accessToken: await accessTokenOf(payload, orderId) }
    }
    const confirmed = await confirmStripePayment(payload, { cart, customerEmail: transaction.customerEmail ?? '', paymentIntentId })
    if (confirmed.ok) return { kind: 'order', orderId: confirmed.orderId, accessToken: confirmed.accessToken }
  }

  // No order from here: ask Stripe whether the payment went through.
  try {
    return (await paymentOutcome(paymentIntentId)) === 'failed' ? { kind: 'failed' } : { kind: 'received' }
  } catch (error) {
    payload.logger.error({ err: error, msg: `Shop: could not read PaymentIntent ${paymentIntentId} at Stripe` })
    return { kind: 'checking' }
  }
}

/**
 * Where the browser goes next. The order page needs the order's access token; until orders have
 * one (S18), a paid order shows "payment received".
 */
export function outcomePath(locale: Locale, outcome: CheckoutOutcome): string {
  switch (outcome.kind) {
    case 'order':
      return outcome.accessToken ? orderPath(locale, outcome.orderId, outcome.accessToken) : paymentReceivedPath(locale)
    case 'received':
      return paymentReceivedPath(locale)
    case 'checking':
      return paymentReceivedPath(locale, true)
    case 'failed':
      return paymentFailedPath(locale)
    case 'unknown':
      return cartPath(locale)
  }
}
