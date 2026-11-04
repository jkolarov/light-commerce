import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'

import { cartPath } from '../cart/paths'
import type { CartRef } from '../cart/load'
import { finalizePayment } from '../orders/finalizePayment'
import { findPaymentTransaction, isPaymentIntentId } from '../payments/stripe/payments'
import { paymentOutcome } from '../payments/stripe/status'
import { orderPath, paymentFailedPath, paymentReceivedPath } from './paths'

// The browser's way back after a payment: Stripe's return URL, and where the form sends the
// browser once a card payment went through. It settles the payment with `finalizePayment`, the
// same function Stripe's webhook calls, so an order is created once, whichever comes first.
//
// Settlement rule (plan, "Orders"): when no order comes back after a payment that succeeded, that
// is "payment received, order pending", never "payment failed": the webhook creates the order.
// The visitor sees a calm "payment received" page.

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

/** How long the browser waits for another call (the webhook) that is settling the payment right now. */
export const SETTLEMENT_WAIT_MS = 3000
const POLL_MS = 250

/**
 * The order of a payment another call is settling right now (the plugin's losing calls give up
 * after 500 ms; a slow winner can take longer). Reads only, for up to `SETTLEMENT_WAIT_MS`.
 */
async function waitForOrder(payload: Payload, paymentIntentId: string): Promise<CheckoutOutcome | null> {
  const deadline = Date.now() + SETTLEMENT_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const transaction = await findPaymentTransaction(payload, paymentIntentId)
    const orderId = transaction?.status === 'succeeded' ? (typeof transaction.order === 'object' ? transaction.order?.id : transaction.order) : null
    if (orderId) {
      const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true, disableErrors: true })
      return order ? { kind: 'order', orderId: order.id, accessToken: order.accessToken ?? null } : null
    }
    if (transaction?.status !== 'processing' && transaction?.status !== 'pending') return null
  }
  return null
}

/** The order for the browser holding the payment's cart, or `null` when none comes back. */
async function orderFor(payload: Payload, paymentIntentId: string): Promise<CheckoutOutcome | null> {
  try {
    const { order } = await finalizePayment(payload, paymentIntentId)
    return { kind: 'order', orderId: order.id, accessToken: order.accessToken ?? null }
  } catch (error) {
    payload.logger.warn({ msg: `Shop: no order yet for PaymentIntent ${paymentIntentId} (${error instanceof Error ? error.message : 'unknown'}); the webhook settles it.` })
    return null
  }
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

  const holder = cart && (await holdsCart(payload, cart, transaction.cart)) ? cart : null
  if (holder && transaction.status === 'succeeded' && transaction.order) {
    const settled = await orderFor(payload, paymentIntentId)
    if (settled) return settled
  }

  // Stripe first: a payment that did not go through (a declined card, a cancelled bank page)
  // never reaches the plugin's settlement.
  let outcome: Awaited<ReturnType<typeof paymentOutcome>>
  try {
    outcome = await paymentOutcome(paymentIntentId)
  } catch (error) {
    payload.logger.error({ err: error, msg: `Shop: could not read PaymentIntent ${paymentIntentId} at Stripe` })
    return { kind: 'checking' }
  }
  if (outcome === 'failed' || outcome === 'unknown') return { kind: 'failed' }

  if (holder && outcome === 'succeeded') {
    const settled = (await orderFor(payload, paymentIntentId)) ?? (await waitForOrder(payload, paymentIntentId))
    if (settled) return settled
  }
  // Paid, or being settled by Stripe, and no order from here: the webhook creates it.
  return { kind: 'received' }
}

/** Where the browser goes next: the order's page needs its access token. */
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
