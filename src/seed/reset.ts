import type { CollectionSlug, Payload, Where } from 'payload'

import type { Transaction } from '@/payload-types'

import { createContext, type SeedContext } from './context'
import { readDemo } from './demo'
import { seedDemo, type SeedSummary } from './index'
import type { SeedOwner } from './options'
import { ensureOwner } from './owner'
import { foreignChecks } from './wipe'

// The demo's nightly reset (deploy/demo/reset.sh runs it in the stack every night): the demo starts
// each day as it was loaded, whatever visitors and the owner did the day before.
//
// 1. Shop on: payments left behind are settled first (`reconcilePayments`, S18, which also sends
//    order emails a stopped server never sent), so nothing a visitor paid for is lost silently.
// 2. Shop on: what visitors left is deleted, by time: orders, transactions, carts and addresses
//    created before the reset started, so nothing made while it runs goes (but an order the
//    reconcile step just made goes with its payment's transaction). Kept: a payment still
//    in progress (a `pending` or `processing` transaction touched in the last hour), so someone
//    paying at that moment still gets their order. Every other transaction goes through
//    `releasePayment` (the shop, orders/release.ts) first: one still open at Stripe is cancelled
//    there before it is deleted, a paid one is settled, and one Stripe is still settling, or that
//    can't be checked (Stripe unreachable), is kept for the next night. A kept payment keeps its
//    cart and any order made for it. Payments flagged for the owner are logged before they go.
// 3. Content the demo doesn't have (pages, products, photos added in the admin) is deleted, except
//    a product a kept payment is for (and, that night, the photos the demo doesn't have).
// 4. The seed runs again: the demo's text, photos, menus and stock as in demo/.
//
// User accounts are never deleted, and the owner keeps their password: the seed needs no
// SEED_OWNER_PASSWORD once the owner exists. Every delete here is a script's (no user), so the
// shop's delete guards (collections/keepReferenced.ts) step aside: what to keep is decided here.

export type ResetSummary = {
  /** What `reconcilePayments` did, per action (shop on). */
  reconciled: Record<string, number>
  /** Deleted, per collection: the shop's activity, then content the demo doesn't have. */
  deleted: Record<string, number>
  /** Kept because a payment is in progress, still open, or just settled (ids). */
  kept: { transactions: number[]; carts: number[]; orders: number[]; products: number[] }
  /** What `releasePayment` did with the transactions about to go, per action (shop on). */
  released: Record<string, number>
  seed: SeedSummary
}

export type ResetOptions = {
  demoDir: string
  /** The owner account: the email is enough once it exists. */
  owner: SeedOwner
  /** When the reset starts: only what was created before it is deleted (now). */
  now?: Date
  /** A `pending` or `processing` payment touched this recently is in progress (60 minutes). */
  inProgressMinutes?: number
  log?: (line: string) => void
}

const idOf = (value: unknown): number | null => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' ? id : null
}
const ids = (values: unknown[]) => [...new Set(values.map(idOf).filter((id): id is number => id !== null))]
const notIn = (kept: number[]): Where => (kept.length ? { id: { not_in: kept } } : { id: { exists: true } })
const countBy = <T extends string>(actions: T[]) => actions.reduce<Record<string, number>>((counts, action) => ({ ...counts, [action]: (counts[action] ?? 0) + 1 }), {})
const listed = (counts: Record<string, number>) => Object.entries(counts).map(([key, n]) => `${n} ${key}`).join(', ')

async function deleteWhere(ctx: SeedContext, collection: CollectionSlug, where: Where, opts: { trash?: boolean; locale?: string } = {}): Promise<number> {
  const result = await ctx.payload.delete({
    collection,
    where,
    depth: 0,
    overrideAccess: true,
    ...(opts.trash ? { trash: true } : {}),
    // A localized field in `where` (a page's slug) is read in this locale.
    ...(opts.locale ? { locale: opts.locale } : {}),
  } as Parameters<Payload['delete']>[0])
  if (result.errors.length) {
    throw new Error(`Reset: could not delete ${result.errors.length} ${collection}: ${result.errors.map((e) => e.message).join('; ')}`)
  }
  return result.docs.length
}

/** Step 1: settle what can be settled, and say what was done. */
async function reconcile(ctx: SeedContext, now: Date): Promise<Record<string, number>> {
  const { reconcilePayments } = await import('@/modules/shop/orders/reconcile')
  const results = await reconcilePayments(ctx.payload, { now })
  const counts = countBy(results.map((result) => result.action))
  ctx.log(`Reset: payments reconciled: ${listed(counts) || 'none left behind'}.`)
  return counts
}

/** Step 2: the shop's activity from before `startedAt` (see above). Returns what was kept. */
async function clearShopActivity(ctx: SeedContext, startedAt: Date, inProgressMinutes: number, deleted: Record<string, number>) {
  const { payload } = ctx
  const before: Where = { createdAt: { less_than: startedAt.toISOString() } }
  const since = new Date(startedAt.getTime() - inProgressMinutes * 60_000).toISOString()
  const { docs: candidates } = await payload.find({ collection: 'transactions', where: before, sort: 'createdAt', depth: 0, pagination: false, overrideAccess: true })
  const inProgress = (transaction: Transaction) => (transaction.status === 'pending' || transaction.status === 'processing') && transaction.updatedAt > since

  // Paid at Stripe, but never an order here: say so before anything goes.
  for (const transaction of candidates.filter((candidate) => candidate.attentionNote)) {
    ctx.log(`Reset: transaction ${transaction.id} (PaymentIntent ${transaction.stripe?.paymentIntentID ?? 'none'}) needed attention: ${transaction.attentionNote}`)
  }

  const { releasePayment } = await import('@/modules/shop/orders/release')
  const kept: Transaction[] = []
  const actions: string[] = []
  for (const transaction of candidates) {
    if (inProgress(transaction)) {
      kept.push(transaction)
      actions.push('in progress')
      continue
    }
    const release = await releasePayment(payload, transaction)
    actions.push(release.action)
    if (!release.deletable) {
      kept.push(transaction)
      ctx.log(`Reset: kept transaction ${transaction.id} (PaymentIntent ${release.paymentIntentId}): ${release.action}${release.reason ? `, ${release.reason}` : ''}.`)
    }
  }
  const released = countBy(actions)
  if (candidates.length) ctx.log(`Reset: payments before deleting them: ${listed(released)}.`)

  const transactions = kept.map((transaction) => transaction.id)
  const carts = ids(kept.map((transaction) => transaction.cart))
  const products = ids(kept.flatMap((transaction) => (transaction.items ?? []).map((item) => item.product)))
  const { docs: madeOrders } = transactions.length
    ? await payload.find({ collection: 'orders', where: { transactions: { in: transactions } }, depth: 0, pagination: false, overrideAccess: true })
    : { docs: [] }
  const orders = madeOrders.map((order) => order.id)

  // Orders: also those the reconcile step just made for a payment that goes now.
  const gone = candidates.filter((transaction) => !transactions.includes(transaction.id)).map((transaction) => transaction.id)
  const ofGone: Where[] = gone.length ? [{ transactions: { in: gone } }] : []
  const steps: [CollectionSlug, Where][] = [
    ['orders', { and: [{ or: [before, ...ofGone] }, notIn(orders)] }],
    ['transactions', { and: [before, notIn(transactions)] }],
    ['carts', { and: [before, notIn(carts)] }],
    ['addresses', before],
  ]
  for (const [collection, where] of steps) {
    if (!payload.collections[collection]) continue
    const n = await deleteWhere(ctx, collection, where)
    if (n) deleted[collection] = n
  }
  if (transactions.length) ctx.log(`Reset: kept ${transactions.length} payment(s) (transactions ${transactions.join(', ')}), with their carts and orders.`)
  return { kept: { transactions, carts, orders, products }, released }
}

/** Step 3: pages, products and photos the demo doesn't have, apart from products a kept payment is for. */
async function deleteForeignContent(ctx: SeedContext, demoDir: string, keptProducts: number[], deleted: Record<string, number>) {
  const demo = readDemo(demoDir)
  // Media last: products and pages may use the photos.
  const checks = foreignChecks(ctx, demo).sort((a, b) => Number(a.collection === 'media') - Number(b.collection === 'media'))
  let keptForeignProduct = false
  for (const { collection, where, trash, locale } of checks) {
    let scope = where
    if (collection === 'products' && keptProducts.length) {
      const { totalDocs } = await ctx.payload.count({ collection, where: { and: [where, { id: { in: keptProducts } }] }, overrideAccess: true, trash: true })
      keptForeignProduct = totalDocs > 0
      scope = { and: [where, notIn(keptProducts)] }
    }
    // A product kept for a payment may use a photo the demo doesn't have: tonight, keep them all.
    if (collection === 'media' && keptForeignProduct) {
      ctx.log('Reset: photos the demo doesn’t have are kept tonight (a product a payment is for may use them).')
      continue
    }
    const n = await deleteWhere(ctx, collection, scope, { trash, locale })
    if (n) deleted[collection] = (deleted[collection] ?? 0) + n
  }
}

/** The nightly reset (see above). Throws if the seed can't run (for example, no owner account yet). */
export async function resetDemo(payload: Payload, opts: ResetOptions): Promise<ResetSummary> {
  const startedAt = opts.now ?? new Date()
  const log = opts.log ?? ((line: string) => payload.logger.info(line))
  const ctx = createContext(payload, log)
  // Before anything is deleted: demo/ must be readable, and the owner there (each throws a SeedError).
  readDemo(opts.demoDir)
  await ensureOwner(ctx, opts.owner)

  const deleted: Record<string, number> = {}
  let reconciled: Record<string, number> = {}
  let kept: ResetSummary['kept'] = { transactions: [], carts: [], orders: [], products: [] }
  let released: Record<string, number> = {}
  if (ctx.modules.shop) {
    reconciled = await reconcile(ctx, startedAt)
    ;({ kept, released } = await clearShopActivity(ctx, startedAt, opts.inProgressMinutes ?? 60, deleted))
  }
  await deleteForeignContent(ctx, opts.demoDir, kept.products, deleted)
  log(`Reset: deleted ${Object.entries(deleted).map(([slug, n]) => `${n} ${slug}`).join(', ') || 'nothing'}. User accounts are kept.`)

  const seed = await seedDemo(payload, { demoDir: opts.demoDir, owner: opts.owner, keepForeign: true, log })
  return { reconciled, deleted, kept, released, seed }
}
