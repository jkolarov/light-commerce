import type { Payload } from 'payload'

import type { Transaction } from '@/payload-types'

import { closeOpenPaymentIntent, type ClosedPaymentIntent, paymentOutcome } from '../payments/stripe/status'
import { finalizePayment } from './finalizePayment'

// Before a script deletes a payment's transaction (the demo's nightly reset, src/seed/reset.ts),
// no payment may be left open at Stripe for it, and none that was paid may be lost:
//
// - settled here (`succeeded`), or never sent to Stripe (no PaymentIntent): may go;
// - open at Stripe (`requires_*`: declined, abandoned, a 3-D Secure step never finished): cancelled
//   at Stripe first, so a tab left open can't pay it afterwards with no transaction left to make
//   the order from; may go once Stripe has cancelled it;
// - cancelled at Stripe: may go;
// - unknown to Stripe: may go once it is a day old. A younger one is kept: Stripe may not know it
//   because tonight's key is another account's (a mistake in .env), and its payment may still be
//   open or paid there. The reset also keeps every transaction when Stripe knows none of the
//   payments it was asked about, unless `stripeKnowsSettledPayments` shows the key is right;
// - paid at Stripe but not settled here: settled now (`finalizePayment`: the order, its emails), and
//   kept, with the order that was just made; kept too if it can't be settled (flagged for the owner);
// - still settling at Stripe (`processing`), or Stripe can't be reached or refuses: kept, for the
//   next run.

export type ReleaseAction = 'closed' | 'cancelled' | 'settled' | 'kept'
export type Release = {
  transactionId: number
  paymentIntentId: string | null
  deletable: boolean
  action: ReleaseAction
  reason?: string
  orderId?: number
  /** What Stripe said, when it was asked. */
  stripe?: ClosedPaymentIntent
}

export type ReleaseOptions = {
  now?: Date
  /** A payment Stripe doesn't know is kept while it is younger than this (24 hours). */
  keepUnknownForHours?: number
}

/** Whether `transaction` may be deleted now (see above), after cancelling or settling its PaymentIntent. */
export async function releasePayment(payload: Payload, transaction: Transaction, options: ReleaseOptions = {}): Promise<Release> {
  const paymentIntentId = transaction.stripe?.paymentIntentID ?? null
  const base = { transactionId: transaction.id, paymentIntentId }
  if (transaction.status === 'succeeded') return { ...base, deletable: true, action: 'closed', reason: 'settled' }
  if (!paymentIntentId) return { ...base, deletable: true, action: 'closed', reason: 'no PaymentIntent' }
  let state: Awaited<ReturnType<typeof closeOpenPaymentIntent>>
  try {
    state = await closeOpenPaymentIntent(paymentIntentId)
  } catch (error) {
    return { ...base, deletable: false, action: 'kept', reason: `Stripe: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
  const asked = { ...base, stripe: state }
  if (state === 'canceled') return { ...asked, deletable: true, action: 'cancelled' }
  if (state === 'unknown') {
    const now = options.now ?? new Date()
    const dayOld = now.getTime() - new Date(transaction.createdAt).getTime() >= (options.keepUnknownForHours ?? 24) * 3_600_000
    return dayOld
      ? { ...asked, deletable: true, action: 'closed', reason: 'unknown to Stripe' }
      : { ...asked, deletable: false, action: 'kept', reason: 'unknown to Stripe, younger than a day (is STRIPE_SECRET_KEY right?)' }
  }
  if (state === 'processing') return { ...asked, deletable: false, action: 'kept', reason: 'Stripe is still settling it' }
  try {
    const { order } = await finalizePayment(payload, paymentIntentId)
    return { ...asked, deletable: false, action: 'settled', orderId: order.id }
  } catch (error) {
    return { ...asked, deletable: false, action: 'kept', reason: `paid at Stripe, not settled here: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
}

/**
 * Whether Stripe knows the newest settled payment among `transactions`, one it surely had: so
 * whether tonight's key is this shop's account. `null` when there is none to ask, or Stripe can't
 * be reached.
 */
export async function stripeKnowsSettledPayments(transactions: readonly Transaction[]): Promise<boolean | null> {
  const settled = transactions
    .filter((transaction) => transaction.status === 'succeeded' && transaction.stripe?.paymentIntentID)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!settled) return null
  try {
    return (await paymentOutcome(settled.stripe!.paymentIntentID!)) !== 'unknown'
  } catch {
    return null
  }
}
