import type { Payload } from 'payload'

import type { Order } from '@/payload-types'

import { confirmStripePayment, findPaymentTransaction } from '../payments/stripe/payments'
import { onOrderFinalized } from './finalized'

// One payment, one order (plan, "Orders", Review focus #1). Stripe's webhook and the browser's
// return both end here, as often as they like and in any order: the order is created inside the
// plugin's own `confirm-order` handler, which claims the payment's transaction atomically (pending
// → processing, `UPDATE … WHERE status = 'pending'`). Only the call that wins the claim creates the
// order, marks the cart bought (`purchasedAt`; the plugin keeps the cart rather than emptying it)
// and lowers the stock; the others wait for it and get the same order. A transaction already
// settled returns its order straight away. No database transactions (the SQLite rule).

/** The PaymentIntent has no transaction here: not a payment this shop started. */
export class UnknownPaymentError extends Error {
  override name = 'UnknownPaymentError'
}

/** The payment was settled, but its order was deleted since (by the owner). Nothing to retry. */
export class OrderDeletedError extends Error {
  override name = 'OrderDeletedError'
}

/** `confirm-order` gave no order: not paid, or settlement still running elsewhere. Worth retrying. */
export class PaymentNotSettledError extends Error {
  override name = 'PaymentNotSettledError'
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const idOf = (value: unknown) => (value && typeof value === 'object' ? (value as { id?: unknown }).id : value)

/**
 * The order of the PaymentIntent `paymentIntentId`, created if it doesn't exist yet. Throws
 * `UnknownPaymentError` for a payment the shop didn't start, `OrderDeletedError` when its order was
 * deleted since, and `PaymentNotSettledError` when Stripe's payment isn't settled (or another call
 * is settling it right now).
 */
export async function finalizePayment(payload: Payload, paymentIntentId: string): Promise<{ order: Order }> {
  const transaction = await findPaymentTransaction(payload, paymentIntentId)
  if (!transaction) throw new UnknownPaymentError(`No transaction for PaymentIntent ${paymentIntentId}.`)

  // Settled already. Its order may have been deleted since (the link then goes empty too).
  const settled = transaction.status === 'succeeded'
  const settledOrderId = idOf(transaction.order)
  let order = settled && settledOrderId ? await payload.findByID({ collection: 'orders', id: settledOrderId as number, depth: 0, overrideAccess: true, disableErrors: true }) : null
  if (settled && !order) throw new OrderDeletedError(`PaymentIntent ${paymentIntentId} was settled, and its order was deleted since.`)

  if (!order) {
    if (transaction.status === 'expired') {
      // The reconcile job expired it as unpaid, but Stripe says it was paid after all (a checkout
      // left open for a day): back to pending, once, so the plugin can claim it.
      await payload.db.updateOne({
        collection: 'transactions',
        where: { and: [{ id: { equals: transaction.id } }, { status: { equals: 'expired' } }] },
        data: { status: 'pending' },
        options: { atomic: true },
      })
    }
    const cartId = idOf(transaction.cart)
    // The cart's secret is locked for normal reads: trusted server code reads it from the database.
    const cart = cartId ? ((await payload.db.findOne({ collection: 'carts', where: { id: { equals: cartId } } })) as { secret?: unknown } | null) : null
    if ((typeof cartId !== 'number' && typeof cartId !== 'string') || typeof cart?.secret !== 'string') {
      throw new PaymentNotSettledError(`PaymentIntent ${paymentIntentId}: its cart is gone, so the plugin cannot settle it.`, 409)
    }
    const confirmed = await confirmStripePayment(payload, {
      cart: { id: cartId as number, secret: cart.secret },
      customerEmail: transaction.customerEmail ?? '',
      paymentIntentId,
    })
    if (!confirmed.ok) throw new PaymentNotSettledError(`PaymentIntent ${paymentIntentId}: confirm-order answered ${confirmed.status}.`, confirmed.status)
    order = await payload.findByID({ collection: 'orders', id: confirmed.orderId as number, depth: 0, overrideAccess: true })
  }

  try {
    await onOrderFinalized(payload, order)
  } catch (error) {
    payload.logger.error({ err: error, msg: `Shop: what follows order ${order.id} failed; the order stands.` })
  }
  return { order }
}
