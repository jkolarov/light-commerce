import type { Payload } from 'payload'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import type { Cart, Product } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { STRIPE_TEST_ENV, stripe } from '../support/stripe'

// `reconcilePayments`: what S26's nightly job runs for payments left behind. Stripe is stood in
// for (tests/support/stripe.ts). Time moves by passing a later `now`.

vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (original) => (await import('../support/stripe')).fakeStripeAdapterModule(await original()))
vi.mock('@/modules/shop/payments/stripe/status', async () => (await import('../support/stripe')).fakeStatusModule())

describeWithShop('reconciling payments left behind', () => {
  let test: TestPayload
  let payload: Payload
  let reconcile: typeof import('@/modules/shop/orders/reconcile')
  let payments: typeof import('@/modules/shop/payments/stripe/payments')
  let cartLoad: typeof import('@/modules/shop/cart/load')
  let product: Product

  const address = { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR' }
  const later = (hours: number) => new Date(Date.now() + hours * 3_600_000)

  const started = async () => {
    const items = [{ product: product.id, quantity: 1 }]
    const cart = await payload.create({ collection: 'carts', data: { items } as Cart, depth: 0, overrideAccess: false })
    const { total } = await cartLoad.priceGuestCart(payload, { items })
    const result = await payments.startStripePayment(payload, { cart: { id: cart.id, secret: cart.secret! }, customerEmail: 'camille@example.com', address, expectedTotal: total })
    if (!result.ok) throw new Error(result.reason)
    return (await payments.findPaymentTransaction(payload, result.paymentIntentId))!
  }
  const transaction = (id: number) => payload.findByID({ collection: 'transactions', id, overrideAccess: true, depth: 0 })
  const ordersOf = async (id: number) => (await payload.find({ collection: 'orders', where: { transactions: { equals: id } }, overrideAccess: true })).docs
  const resultFor = (results: Awaited<ReturnType<typeof reconcile.reconcilePayments>>, id: number) => results.find((result) => result.transactionId === id)

  beforeAll(async () => {
    test = await startPayload(STRIPE_TEST_ENV)
    payload = test.payload
    reconcile = await import('@/modules/shop/orders/reconcile')
    payments = await import('@/modules/shop/payments/stripe/payments')
    cartLoad = await import('@/modules/shop/cart/load')
    product = await payload.create({ collection: 'products', data: { title: 'Mélisse', priceInEUR: 700, inventory: 50, _status: 'published' } as Product, overrideAccess: true })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('settles a paid payment whose webhook never got through, and leaves a recent one to the webhook', async () => {
    const paid = await started()
    stripe.pay(paid.stripe!.paymentIntentID!)
    expect(resultFor(await reconcile.reconcilePayments(payload), paid.id)).toBeUndefined() // too recent
    const result = resultFor(await reconcile.reconcilePayments(payload, { now: later(1) }), paid.id)
    expect(result).toMatchObject({ action: 'settled', orderId: expect.any(Number) })
    expect(await ordersOf(paid.id)).toHaveLength(1)
    // Again: nothing more to do.
    expect(resultFor(await reconcile.reconcilePayments(payload, { now: later(1) }), paid.id)).toBeUndefined()
    expect(await ordersOf(paid.id)).toHaveLength(1)
  })

  it('expires an unpaid payment after a day, not before', async () => {
    const abandoned = await started()
    expect(resultFor(await reconcile.reconcilePayments(payload, { now: later(1) }), abandoned.id)).toMatchObject({ action: 'left', reason: 'not paid yet' })
    expect(resultFor(await reconcile.reconcilePayments(payload, { now: later(25) }), abandoned.id)).toMatchObject({ action: 'expired' })
    expect((await transaction(abandoned.id)).status).toBe('expired')
  })

  it('recovers a settlement that stopped after the order was created', async () => {
    const stuck = await started()
    stripe.pay(stuck.stripe!.paymentIntentID!)
    // A settlement that stopped half-way: claimed, order created, never marked succeeded.
    await payload.db.updateOne({ collection: 'transactions', id: stuck.id, data: { status: 'processing' } })
    const order = await payload.create({ collection: 'orders', data: { amount: stuck.amount, transactions: [stuck.id], customerEmail: 'camille@example.com' }, overrideAccess: true })
    const result = resultFor(await reconcile.reconcilePayments(payload, { now: later(1) }), stuck.id)
    expect(result).toMatchObject({ action: 'recovered', orderId: order.id })
    expect(await transaction(stuck.id)).toMatchObject({ status: 'succeeded', order: order.id })
    expect(await ordersOf(stuck.id)).toHaveLength(1)
    const flagged = await payload.findByID({ collection: 'orders', id: order.id, overrideAccess: true })
    expect(flagged).toMatchObject({ needsAttention: true })
    expect(flagged.attentionNote).toMatch(/interrompu/)
  })

  it('settles again a settlement that stopped before the order existed', async () => {
    const stuck = await started()
    stripe.pay(stuck.stripe!.paymentIntentID!)
    await payload.db.updateOne({ collection: 'transactions', id: stuck.id, data: { status: 'processing' } })
    const result = resultFor(await reconcile.reconcilePayments(payload, { now: later(1) }), stuck.id)
    expect(result).toMatchObject({ action: 'settled', orderId: expect.any(Number) })
    expect(await ordersOf(stuck.id)).toHaveLength(1)
    expect((await transaction(stuck.id)).status).toBe('succeeded')
  })

  it('leaves settled payments alone', async () => {
    const done = await started()
    stripe.pay(done.stripe!.paymentIntentID!)
    await reconcile.reconcilePayments(payload, { now: later(1) })
    const results = await reconcile.reconcilePayments(payload, { now: later(48) })
    expect(resultFor(results, done.id)).toBeUndefined()
  })
})
