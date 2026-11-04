import type { Payload } from 'payload'

import type { Transaction } from '@/payload-types'

import { closeOpenPaymentIntent } from '../payments/stripe/status'
import { finalizePayment } from './finalizePayment'

// Before a script deletes a payment's transaction (the demo's nightly reset, src/seed/reset.ts),
// no payment may be left open at Stripe for it, and none that was paid may be lost:
//
// - settled here (`succeeded`), or never sent to Stripe (no PaymentIntent): may go;
// - open at Stripe (`requires_*`: declined, abandoned, a 3-D Secure step never finished): cancelled
//   at Stripe first, so a tab left open can't pay it afterwards with no transaction left to make
//   the order from; may go once Stripe has cancelled it;
// - cancelled at Stripe, or unknown to it: may go;
// - paid at Stripe but not settled here: settled now (`finalizePayment`: the order, its emails), and
//   kept, with the order that was just made; kept too if it can't be settled (flagged for the owner);
// - still settling at Stripe (`processing`), or Stripe can't be reached or refuses: kept, for the
//   next run.

export type ReleaseAction = 'closed' | 'cancelled' | 'settled' | 'kept'
export type Release = { transactionId: number; paymentIntentId: string | null; deletable: boolean; action: ReleaseAction; reason?: string; orderId?: number }

/** Whether `transaction` may be deleted now (see above), after cancelling or settling its PaymentIntent. */
export async function releasePayment(payload: Payload, transaction: Transaction): Promise<Release> {
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
  if (state === 'canceled') return { ...base, deletable: true, action: 'cancelled' }
  if (state === 'unknown') return { ...base, deletable: true, action: 'closed', reason: 'unknown to Stripe' }
  if (state === 'processing') return { ...base, deletable: false, action: 'kept', reason: 'Stripe is still settling it' }
  try {
    const { order } = await finalizePayment(payload, paymentIntentId)
    return { ...base, deletable: false, action: 'settled', orderId: order.id }
  } catch (error) {
    return { ...base, deletable: false, action: 'kept', reason: `paid at Stripe, not settled here: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
}
