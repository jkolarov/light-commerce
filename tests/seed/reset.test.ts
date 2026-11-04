import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { sql } from '@payloadcms/db-sqlite'
import { handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { getLightConfig } from '@/config'
import type { Cart, Page, Product } from '@/payload-types'
import { seedDemo } from '@/seed'
import { SeedError } from '@/seed/errors'
import { resetDemo, type ResetSummary } from '@/seed/reset'

import { startPayload, type TestPayload } from '../support/payload'
import { STRIPE_TEST_ENV, stripe, stripeSignature, succeededEvent } from '../support/stripe'
import { DEMO_DIR } from './demo-copy'

// The demo's nightly reset (src/seed/reset.ts): a day of visitors and owner edits, then the reset.
// The demo runs with both modules on, so does this test. Stripe is stood in for
// (tests/support/stripe.ts), as in the reconcile job's own tests.

vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (original) => (await import('../support/stripe')).fakeStripeAdapterModule(await original()))
vi.mock('@/modules/shop/payments/stripe/status', async () => (await import('../support/stripe')).fakeStatusModule())

const modules = getLightConfig().modules

describe.skipIf(!(modules.cms && modules.shop))('the nightly reset', () => {
  let app: TestPayload
  let payload: Payload
  let mediaDir: string
  let payments: typeof import('@/modules/shop/payments/stripe/payments')
  let cartLoad: typeof import('@/modules/shop/cart/load')
  let summary: ResetSummary
  const lines: string[] = []
  const owner = { email: 'owner@lesclaies.example', password: 'Claies-reset-test-4q8w2' }
  const address = { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR' }
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

  // What the day left, to look at after the reset.
  const day = {} as {
    demoProduct: Product
    addedProduct: Product
    addedForSale: Product
    addedPage: Page
    paidOrder: number
    lostWebhook: { transaction: number; paymentIntentId: string }
    stale: { transaction: number; cart: number; paymentIntentId: string }
    inProgress: { transaction: number; cart: number; paymentIntentId: string }
    abandonedCart: number
  }

  const product = async (slug: string) => {
    const { docs } = await payload.find({ collection: 'products', where: { slug: { equals: slug } }, depth: 0, overrideAccess: true, trash: true })
    return docs[0]
  }
  const newCart = async (items: { product: number; quantity: number }[]) => {
    const created = await payload.create({ collection: 'carts', data: { items } as Cart, depth: 0, overrideAccess: false })
    return { id: created.id, secret: created.secret! }
  }
  const startPayment = async (items: { product: number; quantity: number }[], existing?: { id: number; secret: string }) => {
    const cart = existing ?? (await newCart(items))
    const { total } = await cartLoad.priceGuestCart(payload, { items })
    const started = await payments.startStripePayment(payload, { cart, customerEmail: 'camille@example.com', address, expectedTotal: total })
    if (!started.ok) throw new Error(`payment not started: ${started.reason}`)
    const transaction = (await payments.findPaymentTransaction(payload, started.paymentIntentId))!
    return { cart: cart.id, transaction: transaction.id, paymentIntentId: started.paymentIntentId }
  }
  /** Moves a transaction's last change back in time (the job looks at `updatedAt`). */
  const touchedAt = (id: number, at: string) => payload.db.drizzle.run(sql`UPDATE transactions SET updated_at = ${at}, created_at = ${at} WHERE id = ${id}`)
  const webhook = async (body: string) => {
    const url = new URL('/api/payments/stripe/webhooks', 'http://localhost')
    const res = await handleEndpoints({
      config: payload.config,
      path: url.pathname,
      request: new Request(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(body) } }),
    })
    return res.status
  }
  const all = async (collection: 'orders' | 'transactions' | 'carts' | 'users') =>
    (await payload.find({ collection, depth: 0, pagination: false, overrideAccess: true })).docs.map((doc) => doc.id)

  beforeAll(async () => {
    mediaDir = mkdtempSync(path.join(tmpdir(), 'lc-reset-media-'))
    app = await startPayload({ ...STRIPE_TEST_ENV, MEDIA_DIR: mediaDir })
    payload = app.payload
    payments = await import('@/modules/shop/payments/stripe/payments')
    cartLoad = await import('@/modules/shop/cart/load')
    await seedDemo(payload, { demoDir: DEMO_DIR, owner, log: () => {} })

    // The owner's day in the admin: a demo product's stock and text changed, a product and a page added.
    day.demoProduct = (await product('verveine-odorante'))!
    await payload.update({ collection: 'products', id: day.demoProduct.id, data: { inventory: 5, title: 'Verveine (modifiée)', _status: 'published' }, locale: 'fr', overrideAccess: true })
    day.addedProduct = await payload.create({ collection: 'products', data: { title: 'Ajout du jour', slug: 'ajout-du-jour', priceInEUR: 500, inventory: 3, _status: 'published' } as Product, overrideAccess: true })
    day.addedForSale = await payload.create({ collection: 'products', data: { title: 'En vente cette nuit', slug: 'en-vente-cette-nuit', priceInEUR: 600, inventory: 3, _status: 'published' } as Product, overrideAccess: true })
    day.addedPage = await payload.create({ collection: 'pages', data: { title: 'Page du jour', slug: 'page-du-jour', _status: 'published' } as Page, locale: 'fr', overrideAccess: true })

    // Visitors: a paid order, a payment whose webhook never came, an abandoned checkout, an
    // abandoned cart, and someone paying right now (for the product added today).
    const paid = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    stripe.pay(paid.paymentIntentId)
    expect(await webhook(succeededEvent(paid.paymentIntentId))).toBe(200)
    day.paidOrder = (await payload.find({ collection: 'orders', where: { transactions: { equals: paid.transaction } }, depth: 0, overrideAccess: true })).docs[0]!.id

    const lost = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    stripe.pay(lost.paymentIntentId)
    await touchedAt(lost.transaction, hoursAgo(2))
    day.lostWebhook = lost

    day.stale = await startPayment([{ product: day.addedProduct.id, quantity: 1 }])
    await touchedAt(day.stale.transaction, hoursAgo(2))
    day.abandonedCart = (await newCart([{ product: day.demoProduct.id, quantity: 1 }])).id
    day.inProgress = await startPayment([{ product: day.addedForSale.id, quantity: 1 }])

    summary = await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, log: (line) => lines.push(line) })
  }, 300_000)

  afterAll(async () => {
    await app?.stop()
    rmSync(mediaDir, { recursive: true, force: true })
  })

  it('first settles what a visitor paid for and never became an order', () => {
    expect(summary.reconciled.settled).toBe(1)
    expect(lines.join('\n')).toMatch(/payments reconciled: .*1 settled/)
  })

  it('deletes orders, carts and transactions, except a payment in progress with its cart', async () => {
    expect(await all('orders')).toEqual([])
    // The abandoned checkout was cancelled at Stripe before its transaction went: no tab left open
    // can pay it now. The one in progress was left alone.
    expect(stripe.intents.get(day.stale.paymentIntentId)?.status).toBe('canceled')
    expect(stripe.intents.get(day.inProgress.paymentIntentId)?.status).toBe('requires_payment_method')
    expect(await all('transactions')).toEqual([day.inProgress.transaction])
    expect(await all('carts')).toEqual([day.inProgress.cart])
    expect(summary.kept.transactions).toEqual([day.inProgress.transaction])
    expect(summary.deleted).toMatchObject({ orders: 2, transactions: 3, carts: 4 })
  })

  it('deletes the content the demo doesn’t have, except a product a payment in progress is for', async () => {
    expect(await product('ajout-du-jour')).toBeUndefined()
    expect(await product('en-vente-cette-nuit')).toMatchObject({ id: day.addedForSale.id })
    expect(await payload.findByID({ collection: 'pages', id: day.addedPage.id, overrideAccess: true, disableErrors: true })).toBeNull()
  })

  it('restores the demo’s text and stock', async () => {
    const restored = (await payload.findByID({ collection: 'products', id: day.demoProduct.id, locale: 'fr', overrideAccess: true }))!
    expect(restored.title).toBe(day.demoProduct.title)
    expect(restored.inventory).toBe(day.demoProduct.inventory)
    expect(summary.seed.owner).toBe('kept')
  })

  it('never deletes users, and the owner logs in with their password as before', async () => {
    expect(await all('users')).toHaveLength(1)
    const login = await payload.login({ collection: 'users', data: owner, overrideAccess: true })
    expect(login.user?.email).toBe(owner.email)
  })

  it('still makes the order of the payment that was in progress', async () => {
    stripe.pay(day.inProgress.paymentIntentId)
    expect(await webhook(succeededEvent(day.inProgress.paymentIntentId))).toBe(200)
    const { docs } = await payload.find({ collection: 'orders', where: { transactions: { equals: day.inProgress.transaction } }, depth: 0, overrideAccess: true })
    expect(docs).toHaveLength(1)
  })

  it('runs again the next night, with nothing left behind', async () => {
    const next = await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, now: new Date(Date.now() + 2 * 3_600_000), log: () => {} })
    expect(await all('orders')).toEqual([])
    expect(await all('transactions')).toEqual([])
    expect(await product('en-vente-cette-nuit')).toBeUndefined()
    expect(next.seed.owner).toBe('kept')
  }, 120_000)

  it('keeps a payment it can’t check at Stripe, with its cart, and lets it go the next night', async () => {
    const unchecked = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    await touchedAt(unchecked.transaction, hoursAgo(3))
    const later = new Date(Date.now() + 3 * 3_600_000)
    stripe.unreachable = true
    try {
      await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, now: later, log: () => {} })
    } finally {
      stripe.unreachable = false
    }
    expect(await all('transactions')).toContain(unchecked.transaction)
    expect(await all('carts')).toContain(unchecked.cart)
    await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, now: later, log: () => {} })
    expect(await all('transactions')).not.toContain(unchecked.transaction)
    expect(stripe.intents.get(unchecked.paymentIntentId)?.status).toBe('canceled')
  }, 120_000)

  it('deletes only what was made before it started, never what a visitor makes while it runs', async () => {
    const before = await newCart([{ product: day.demoProduct.id, quantity: 1 }])
    const startedAt = new Date()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const during = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, now: startedAt, log: () => {} })
    const carts = await all('carts')
    expect(carts).not.toContain(before.id)
    expect(carts).toContain(during.cart)
    expect(await all('transactions')).toContain(during.transaction)
    expect(stripe.intents.get(during.paymentIntentId)?.status).toBe('requires_payment_method')
  }, 120_000)

  it('keeps the cart of a payment started while it runs, even when the cart is older', async () => {
    const items = [{ product: day.demoProduct.id, quantity: 1 }]
    const cart = await newCart(items)
    const startedAt = new Date()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const late = await startPayment(items, cart)
    await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, now: startedAt, log: () => {} })
    expect(await all('carts')).toContain(cart.id)
    expect(await all('transactions')).toContain(late.transaction)
  }, 120_000)

  it('deletes no transaction, and says why, when Stripe knows none of the payments (a wrong key that night)', async () => {
    const paid = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    stripe.pay(paid.paymentIntentId)
    expect(await webhook(succeededEvent(paid.paymentIntentId))).toBe(200)
    const old = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    await touchedAt(old.transaction, hoursAgo(30))
    // Another account's key: Stripe knows neither the settled payment nor the old one.
    const saved = [paid, old].map(({ paymentIntentId }) => [paymentIntentId, stripe.intents.get(paymentIntentId)!] as const)
    for (const [id] of saved) stripe.intents.delete(id)
    const nightLines: string[] = []
    try {
      await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, log: (line) => nightLines.push(line) })
      expect(await all('transactions')).toEqual(expect.arrayContaining([paid.transaction, old.transaction]))
      expect(await all('carts')).toEqual(expect.arrayContaining([paid.cart, old.cart]))
      expect(nightLines.join('\n')).toMatch(/Stripe knew none of the \d+ payment\(s\) it was asked about.*STRIPE_SECRET_KEY.*no transaction was deleted/s)
    } finally {
      for (const [id, intent] of saved) stripe.intents.set(id, intent)
    }
    // The right key again: both go the next night.
    await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, log: () => {} })
    expect(await all('transactions')).not.toContain(paid.transaction)
    expect(await all('transactions')).not.toContain(old.transaction)
  }, 180_000)

  it('lets a payment Stripe doesn’t know go once it is a day old, when Stripe knows the settled ones', async () => {
    const paid = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    stripe.pay(paid.paymentIntentId)
    expect(await webhook(succeededEvent(paid.paymentIntentId))).toBe(200)
    const old = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    await touchedAt(old.transaction, hoursAgo(30))
    const young = await startPayment([{ product: day.demoProduct.id, quantity: 1 }])
    await touchedAt(young.transaction, hoursAgo(3))
    // Its test data deleted at Stripe, say: the old payments are gone there, the key is right.
    stripe.intents.delete(old.paymentIntentId)
    stripe.intents.delete(young.paymentIntentId)
    await resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: owner.email }, log: () => {} })
    const left = await all('transactions')
    expect(left).not.toContain(paid.transaction)
    expect(left).not.toContain(old.transaction)
    expect(left).toContain(young.transaction)
  }, 120_000)

  it('deletes nothing when the owner account isn’t there: it never creates one without a password', async () => {
    const before = await all('carts')
    await newCart([{ product: day.demoProduct.id, quantity: 1 }])
    await expect(resetDemo(payload, { demoDir: DEMO_DIR, owner: { email: 'someone-else@lesclaies.example' }, log: () => {} })).rejects.toThrow(SeedError)
    expect((await all('carts')).length).toBe(before.length + 1)
  })
})
