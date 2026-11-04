import type { Payload } from 'payload'

import type { Transaction } from '@/payload-types'

import { paymentOutcome } from '../payments/stripe/status'
import { finalizePayment } from './finalizePayment'

// Payments left behind, for a scheduled job (S26's nightly run): `reconcilePayments(payload)`.
// Stripe's webhook settles paid orders on its own and retries for days; this catches what falls
// through, without database transactions (the SQLite rule):
//
// - `pending`, and paid at Stripe: the webhook never got through. Settled with `finalizePayment`.
// - `pending`, and not paid (a declined card, an abandoned checkout), for more than a day:
//   marked `expired`. Before that the visitor may still pay it from the same checkout page.
// - `processing` for a while: a settlement that stopped half-way (the server stopped, or the
//   plugin threw after its claim, for example on a product deleted for good). If an order already
//   references it, the transaction is marked `succeeded` and the order is flagged, because the
//   cart and the stock may not have been updated. Otherwise it goes back to `pending` (a
//   conditional, atomic update) and is settled again. Should a live settlement still be running,
//   the plugin refuses to create a second order for a transaction that already has one.
//
// Everything else is left as it is and reported.

export type ReconcileAction = 'settled' | 'expired' | 'recovered' | 'left'
export type ReconcileResult = { transactionId: number; paymentIntentId: string | null; action: ReconcileAction; orderId?: number; reason?: string }

export type ReconcileOptions = {
  now?: Date
  /** A `pending` or `processing` transaction untouched for this long is looked at (30 minutes). */
  staleAfterMinutes?: number
  /** An unpaid `pending` transaction older than this is marked `expired` (24 hours). */
  expireAfterHours?: number
}

const note = {
  fr: 'Le règlement de cette commande a été interrompu puis repris : vérifiez que le stock a bien été décompté.',
  en: 'Settling this order was interrupted, then resumed: check that its stock was taken off.',
}

async function recover(payload: Payload, transaction: Transaction, cutoff: Date): Promise<ReconcileResult | null> {
  const base = { transactionId: transaction.id, paymentIntentId: transaction.stripe?.paymentIntentID ?? null }
  const { docs } = await payload.find({ collection: 'orders', where: { transactions: { equals: transaction.id } }, depth: 0, limit: 1, overrideAccess: true })
  const order = docs[0]
  if (order) {
    const claimed = await payload.db.updateOne({
      collection: 'transactions',
      where: { and: [{ id: { equals: transaction.id } }, { status: { equals: 'processing' } }] },
      data: { status: 'succeeded', order: order.id },
      options: { atomic: true },
    })
    if (!claimed) return { ...base, action: 'left', reason: 'settled meanwhile' }
    const language = payload.config.localization && payload.config.localization.defaultLocale === 'en' ? 'en' : 'fr'
    await payload.db.updateOne({
      collection: 'orders',
      id: order.id,
      data: { needsAttention: true, attentionNote: [order.attentionNote, note[language]].filter(Boolean).join('\n') },
    })
    return { ...base, action: 'recovered', orderId: order.id }
  }
  // No order: back to pending, only if nobody touched it since it was read.
  const reset = await payload.db.updateOne({
    collection: 'transactions',
    where: { and: [{ id: { equals: transaction.id } }, { status: { equals: 'processing' } }, { updatedAt: { less_than: cutoff.toISOString() } }] },
    data: { status: 'pending' },
    options: { atomic: true },
  })
  return reset ? null : { ...base, action: 'left', reason: 'settled meanwhile' }
}

async function settleOrExpire(payload: Payload, transaction: Transaction, expireBefore: Date): Promise<ReconcileResult> {
  const paymentIntentId = transaction.stripe?.paymentIntentID ?? null
  const base = { transactionId: transaction.id, paymentIntentId }
  if (!paymentIntentId) return { ...base, action: 'left', reason: 'no PaymentIntent' }
  let outcome: Awaited<ReturnType<typeof paymentOutcome>>
  try {
    outcome = await paymentOutcome(paymentIntentId)
  } catch (error) {
    return { ...base, action: 'left', reason: `Stripe: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
  if (outcome === 'succeeded') {
    try {
      const { order } = await finalizePayment(payload, paymentIntentId)
      return { ...base, action: 'settled', orderId: order.id }
    } catch (error) {
      return { ...base, action: 'left', reason: error instanceof Error ? error.message : 'could not settle' }
    }
  }
  if (outcome === 'failed' && new Date(transaction.createdAt) < expireBefore) {
    const expired = await payload.db.updateOne({
      collection: 'transactions',
      where: { and: [{ id: { equals: transaction.id } }, { status: { equals: 'pending' } }] },
      data: { status: 'expired' },
      options: { atomic: true },
    })
    return expired ? { ...base, action: 'expired' } : { ...base, action: 'left', reason: 'changed meanwhile' }
  }
  return { ...base, action: 'left', reason: outcome === 'processing' ? 'Stripe is still settling it' : 'not paid yet' }
}

/** Settles, recovers or expires the payments left behind (see above), and says what it did. */
export async function reconcilePayments(payload: Payload, options: ReconcileOptions = {}): Promise<ReconcileResult[]> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - (options.staleAfterMinutes ?? 30) * 60_000)
  const expireBefore = new Date(now.getTime() - (options.expireAfterHours ?? 24) * 3_600_000)
  const { docs } = await payload.find({
    collection: 'transactions',
    where: { and: [{ status: { in: ['pending', 'processing'] } }, { updatedAt: { less_than: cutoff.toISOString() } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const results: ReconcileResult[] = []
  for (const transaction of docs) {
    try {
      if (transaction.status === 'processing') {
        const recovered = await recover(payload, transaction, cutoff)
        if (recovered) {
          results.push(recovered)
          continue
        }
      }
      results.push(await settleOrExpire(payload, transaction, expireBefore))
    } catch (error) {
      results.push({ transactionId: transaction.id, paymentIntentId: transaction.stripe?.paymentIntentID ?? null, action: 'left', reason: error instanceof Error ? error.message : 'error' })
    }
  }
  const done = results.filter((result) => result.action !== 'left')
  if (done.length) payload.logger.info({ msg: `Shop: reconciled ${done.length} payment(s): ${done.map((r) => `${r.transactionId} ${r.action}`).join(', ')}.` })
  return results
}
