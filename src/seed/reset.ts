import type { CollectionSlug, Payload, Where } from 'payload'

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
// 2. Shop on: orders, transactions, carts and addresses are deleted, except a payment still in
//    progress: a `pending` or `processing` transaction touched in the last hour, its cart, and an
//    order already made for it. Someone paying at that moment still gets their order. Paid
//    payments the reconcile job could not settle are logged before they go.
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
  /** Kept because a payment is still in progress (ids). */
  kept: { transactions: number[]; carts: number[]; orders: number[]; products: number[] }
  seed: SeedSummary
}

export type ResetOptions = {
  demoDir: string
  /** The owner account: the email is enough once it exists. */
  owner: SeedOwner
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

async function deleteWhere(ctx: SeedContext, collection: CollectionSlug, where: Where, trash = false): Promise<number> {
  const result = await ctx.payload.delete({ collection, where, depth: 0, overrideAccess: true, ...(trash ? { trash: true } : {}) })
  if (result.errors.length) {
    throw new Error(`Reset: could not delete ${result.errors.length} ${collection}: ${result.errors.map((e) => e.message).join('; ')}`)
  }
  return result.docs.length
}

/** Step 1: settle what can be settled, and say what was done. */
async function reconcile(ctx: SeedContext, now: Date): Promise<Record<string, number>> {
  const { reconcilePayments } = await import('@/modules/shop/orders/reconcile')
  const results = await reconcilePayments(ctx.payload, { now })
  const counts: Record<string, number> = {}
  for (const result of results) counts[result.action] = (counts[result.action] ?? 0) + 1
  ctx.log(`Reset: payments reconciled: ${Object.entries(counts).map(([action, n]) => `${n} ${action}`).join(', ') || 'none left behind'}.`)
  return counts
}

/** Step 2: the shop's activity, apart from payments in progress. Returns what was kept. */
async function clearShopActivity(ctx: SeedContext, now: Date, inProgressMinutes: number, deleted: Record<string, number>) {
  const { payload } = ctx
  const since = new Date(now.getTime() - inProgressMinutes * 60_000).toISOString()
  const { docs: inProgress } = await payload.find({
    collection: 'transactions',
    where: { and: [{ status: { in: ['pending', 'processing'] } }, { updatedAt: { greater_than: since } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const transactions = inProgress.map((transaction) => transaction.id)
  const carts = ids(inProgress.map((transaction) => transaction.cart))
  const { docs: madeOrders } = transactions.length
    ? await payload.find({ collection: 'orders', where: { transactions: { in: transactions } }, depth: 0, pagination: false, overrideAccess: true })
    : { docs: [] }
  const orders = madeOrders.map((order) => order.id)
  const products = ids(inProgress.flatMap((transaction) => (transaction.items ?? []).map((item) => item.product)))

  // Paid at Stripe, but never an order here: say so before the transaction goes.
  const { docs: flagged } = await payload.find({
    collection: 'transactions',
    where: { and: [{ attentionNote: { exists: true } }, notIn(transactions)] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const transaction of flagged) {
    ctx.log(`Reset: deleting transaction ${transaction.id} (PaymentIntent ${transaction.stripe?.paymentIntentID ?? 'none'}), which needed attention: ${transaction.attentionNote}`)
  }

  const steps: [CollectionSlug, number[]][] = [
    ['orders', orders],
    ['transactions', transactions],
    ['carts', carts],
    ['addresses', []],
  ]
  for (const [collection, kept] of steps) {
    if (!payload.collections[collection]) continue
    const n = await deleteWhere(ctx, collection, notIn(kept))
    if (n) deleted[collection] = n
  }
  if (transactions.length) ctx.log(`Reset: kept ${transactions.length} payment(s) in progress (transactions ${transactions.join(', ')}), with their carts and orders.`)
  return { transactions, carts, orders, products }
}

/** Step 3: pages, products and photos the demo doesn't have, apart from products a kept payment is for. */
async function deleteForeignContent(ctx: SeedContext, demoDir: string, keptProducts: number[], deleted: Record<string, number>) {
  const demo = readDemo(demoDir)
  // Media last: products and pages may use the photos.
  const checks = foreignChecks(ctx, demo).sort((a, b) => Number(a.collection === 'media') - Number(b.collection === 'media'))
  let keptForeignProduct = false
  for (const { collection, where, trash } of checks) {
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
    const n = await deleteWhere(ctx, collection, scope, trash)
    if (n) deleted[collection] = (deleted[collection] ?? 0) + n
  }
}

/** The nightly reset (see above). Throws if the seed can't run (for example, no owner account yet). */
export async function resetDemo(payload: Payload, opts: ResetOptions): Promise<ResetSummary> {
  const now = opts.now ?? new Date()
  const log = opts.log ?? ((line: string) => payload.logger.info(line))
  const ctx = createContext(payload, log)
  // Before anything is deleted: demo/ must be readable, and the owner there (each throws a SeedError).
  readDemo(opts.demoDir)
  await ensureOwner(ctx, opts.owner)

  const deleted: Record<string, number> = {}
  let reconciled: Record<string, number> = {}
  let kept: ResetSummary['kept'] = { transactions: [], carts: [], orders: [], products: [] }
  if (ctx.modules.shop) {
    reconciled = await reconcile(ctx, now)
    kept = await clearShopActivity(ctx, now, opts.inProgressMinutes ?? 60, deleted)
  }
  await deleteForeignContent(ctx, opts.demoDir, kept.products, deleted)
  log(`Reset: deleted ${Object.entries(deleted).map(([slug, n]) => `${n} ${slug}`).join(', ') || 'nothing'}. User accounts are kept.`)

  const seed = await seedDemo(payload, { demoDir: opts.demoDir, owner: opts.owner, keepForeign: true, log })
  return { reconciled, deleted, kept, seed }
}
