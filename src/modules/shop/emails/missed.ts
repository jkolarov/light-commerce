import type { Payload } from 'payload'

import { onOrderFinalized } from '../orders/finalized'

// Order emails a stopped server never sent, for the nightly job (the last step of
// `reconcilePayments`, orders/reconcile.ts). During a request the emails go out after the
// response (Next's `after`), so a server stopped hard at that moment (a crash, `kill -9`, a
// container killed after its stop grace) can lose them:
//
// - stopped before the claim: `confirmationEmailSentAt` stays empty. That is what this finds, and
//   it runs the seam again, which claims and sends as usual (once, even next to a live call);
// - stopped after the claim, while sending: the order looks sent, and nothing tells it apart from
//   one that was. Those stay at most once (see ./send.ts): a buyer never gets the same email twice.
//
// Only paid orders still waiting to be shipped (`processing`), whose payment is settled, and at
// least `olderThanMinutes` old (a younger one may still be sending). A settlement that stopped
// half-way is the reconcile job's own: it recovers it, and runs the seam then.

export type MissedEmailsOptions = {
  now?: Date
  /** Orders at least this old (30 minutes). */
  olderThanMinutes?: number
  /** At most this many orders per run, the oldest first (100). */
  limit?: number
}

/** Runs the order emails for paid orders that never had them (see above). Returns those orders' IDs. */
export async function sendMissedOrderEmails(payload: Payload, options: MissedEmailsOptions = {}): Promise<number[]> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - (options.olderThanMinutes ?? 30) * 60_000)
  const { docs } = await payload.find({
    collection: 'orders',
    where: { and: [{ confirmationEmailSentAt: { exists: false } }, { status: { equals: 'processing' } }, { createdAt: { less_than: cutoff.toISOString() } }] },
    sort: 'createdAt',
    limit: options.limit ?? 100,
    depth: 0,
    overrideAccess: true,
  })
  const handled: number[] = []
  for (const order of docs) {
    const settled = await payload.count({
      collection: 'transactions',
      where: { and: [{ order: { equals: order.id } }, { status: { equals: 'succeeded' } }] },
      overrideAccess: true,
    })
    if (!settled.totalDocs) continue
    try {
      await onOrderFinalized(payload, order)
      handled.push(order.id)
    } catch (error) {
      payload.logger.error({ err: error, msg: `Shop: the missed emails of order ${order.id} failed.` })
    }
  }
  if (handled.length) payload.logger.warn({ msg: `Shop: order emails sent late (the server had stopped before sending them) for order(s) ${handled.join(', ')}.` })
  return handled
}
