import type { Payload } from 'payload'

import type { Order, Transaction } from '@/payload-types'

import { readLinePrices } from '../collections/breakdown'
import { formatMoney } from '../money'
import { paymentOutcome } from '../payments/stripe/status'
import { finalizePayment, PaymentNotSettledError } from './finalizePayment'
import { onOrderFinalized } from './finalized'

// Payments left behind, for a scheduled job (S26's nightly run): `reconcilePayments(payload)`.
// Stripe's webhook settles paid orders on its own and retries for days; this catches what falls
// through, without database transactions (the SQLite rule). It looks at the oldest `pending` and
// `processing` transactions untouched for a while (at most `limit` per run):
//
// - `pending`, and paid at Stripe: the webhook never got through. Settled with `finalizePayment`.
// - `pending`, and not paid (a declined card, an abandoned checkout), for more than a day:
//   marked `expired`. Before that the visitor may still pay it from the same checkout page; if it
//   is paid after all, `finalizePayment` puts it back to `pending` and settles it.
// - `processing` for a while: a settlement that stopped half-way (the server stopped, or the
//   plugin threw after its claim). If an order already references it, the transaction is marked
//   `succeeded` and the order is flagged, because the cart and the stock may not have been
//   updated; if the order lost lines, the note lists what was charged. What follows a paid order
//   (`onOrderFinalized`, S19's emails) runs then. Otherwise it goes back to `pending` (a
//   conditional, atomic update) and is settled again. Should a live settlement still be running,
//   the plugin refuses to create a second order for a transaction that already has one.
// - What can never be settled stops being looked at: no PaymentIntent, or one Stripe doesn't know,
//   is marked `failed` (no Stripe payment was made); paid at Stripe but impossible to settle here
//   (its cart is gone) gets an `attentionNote` once, and the error log says what to do.
//
// Everything else is left as it is and reported.

export type ReconcileAction = 'settled' | 'expired' | 'recovered' | 'failed' | 'flagged' | 'left'
export type ReconcileResult = { transactionId: number; paymentIntentId: string | null; action: ReconcileAction; orderId?: number; reason?: string }

export type ReconcileOptions = {
  now?: Date
  /** A `pending` or `processing` transaction untouched for this long is looked at (30 minutes). */
  staleAfterMinutes?: number
  /** An unpaid `pending` transaction older than this is marked `expired` (24 hours). */
  expireAfterHours?: number
  /** At most this many transactions per run, the oldest first (100). */
  limit?: number
}

type Language = 'fr' | 'en'

const notes = {
  fr: {
    resumed: 'Le règlement de cette commande a été interrompu puis repris : vérifiez que le stock a bien été décompté.',
    lostLines: (lines: string) => `Le règlement de cette commande a été interrompu, et la commande a perdu des lignes. Facturé : ${lines}. Le stock et le panier n’ont pas été mis à jour : vérifiez avant d’expédier.`,
    unsettleable: (id: string) => `Payé chez Stripe (${id}), mais impossible à régler ici : son panier n’existe plus. Créez la commande à la main ou remboursez dans Stripe.`,
  },
  en: {
    resumed: 'Settling this order was interrupted, then resumed: check that its stock was taken off.',
    lostLines: (lines: string) => `Settling this order was interrupted, and the order lost lines. Charged: ${lines}. Stock and cart were not updated: check before shipping.`,
    unsettleable: (id: string) => `Paid at Stripe (${id}), but it can't be settled here: its cart is gone. Create the order by hand, or refund it in Stripe.`,
  },
}

const languageOf = (payload: Payload): Language => (payload.config.localization && payload.config.localization.defaultLocale === 'en' ? 'en' : 'fr')

/** The note for a recovered order: what was charged, when the order has fewer lines than that. */
async function recoveryNote(payload: Payload, order: Order): Promise<string> {
  const language = languageOf(payload)
  const charged = readLinePrices(order.linePrices)
  if ((order.items?.length ?? 0) >= charged.length) return notes[language].resumed
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { in: charged.map((line) => line.product) } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    trash: true,
    locale: language,
    select: { title: true },
  })
  const titles = new Map(docs.map((doc) => [String(doc.id), doc.title]))
  const money = (cents: number) => formatMoney(cents, { currency: order.currency ?? 'EUR', locale: language })
  const lines = charged.map((line) => `${line.quantity} × ${titles.get(String(line.product)) ?? `#${line.product}`} (${money(line.lineTotal)})`).join(', ')
  return notes[language].lostLines(lines)
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
    const attentionNote = [order.attentionNote, await recoveryNote(payload, order)].filter(Boolean).join('\n')
    await payload.db.updateOne({ collection: 'orders', id: order.id, data: { needsAttention: true, attentionNote } })
    try {
      await onOrderFinalized(payload, { ...order, needsAttention: true, attentionNote })
    } catch (error) {
      payload.logger.error({ err: error, msg: `Shop: what follows order ${order.id} failed; the order stands.` })
    }
    return { ...base, action: 'recovered', orderId: order.id }
  }
  // No order: back to pending, only if nobody touched it since it was read (the plugin's claim
  // refreshes `updatedAt`).
  const reset = await payload.db.updateOne({
    collection: 'transactions',
    where: { and: [{ id: { equals: transaction.id } }, { status: { equals: 'processing' } }, { updatedAt: { less_than: cutoff.toISOString() } }] },
    data: { status: 'pending' },
    options: { atomic: true },
  })
  return reset ? null : { ...base, action: 'left', reason: 'settled meanwhile' }
}

/** Marks a transaction `failed`, if it is still `pending`: no Stripe payment was made. */
async function close(payload: Payload, transaction: Transaction, reason: string): Promise<ReconcileResult> {
  const base = { transactionId: transaction.id, paymentIntentId: transaction.stripe?.paymentIntentID ?? null }
  const closed = await payload.db.updateOne({
    collection: 'transactions',
    where: { and: [{ id: { equals: transaction.id } }, { status: { equals: 'pending' } }] },
    data: { status: 'failed' },
    options: { atomic: true },
  })
  return closed ? { ...base, action: 'failed', reason } : { ...base, action: 'left', reason: 'changed meanwhile' }
}

async function settleOrExpire(payload: Payload, transaction: Transaction, expireBefore: Date): Promise<ReconcileResult> {
  const paymentIntentId = transaction.stripe?.paymentIntentID ?? null
  const base = { transactionId: transaction.id, paymentIntentId }
  if (!paymentIntentId) return close(payload, transaction, 'no PaymentIntent')
  let outcome: Awaited<ReturnType<typeof paymentOutcome>>
  try {
    outcome = await paymentOutcome(paymentIntentId)
  } catch (error) {
    return { ...base, action: 'left', reason: `Stripe: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
  if (outcome === 'unknown') return close(payload, transaction, 'unknown to Stripe')
  if (outcome === 'succeeded') {
    try {
      const { order } = await finalizePayment(payload, paymentIntentId)
      return { ...base, action: 'settled', orderId: order.id }
    } catch (error) {
      if (error instanceof PaymentNotSettledError && error.status === 409) {
        // Paid, and never settleable here: say so once, and stop looking at it.
        await payload.db.updateOne({ collection: 'transactions', id: transaction.id, data: { attentionNote: notes[languageOf(payload)].unsettleable(paymentIntentId) } })
        payload.logger.error({ msg: `Shop: PaymentIntent ${paymentIntentId} was paid but can't be settled (its cart is gone): create the order by hand or refund it in Stripe.` })
        return { ...base, action: 'flagged', reason: error.message }
      }
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

/** Settles, recovers, expires or closes the payments left behind (see above), and says what it did. */
export async function reconcilePayments(payload: Payload, options: ReconcileOptions = {}): Promise<ReconcileResult[]> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - (options.staleAfterMinutes ?? 30) * 60_000)
  const expireBefore = new Date(now.getTime() - (options.expireAfterHours ?? 24) * 3_600_000)
  const { docs } = await payload.find({
    collection: 'transactions',
    where: {
      and: [{ status: { in: ['pending', 'processing'] } }, { updatedAt: { less_than: cutoff.toISOString() } }, { attentionNote: { exists: false } }],
    },
    sort: 'updatedAt',
    limit: options.limit ?? 100,
    depth: 0,
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
