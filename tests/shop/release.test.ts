import type { Payload } from 'payload'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import type { Cart, Product } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { STRIPE_TEST_ENV, stripe } from '../support/stripe'

// `releasePayment` (orders/release.ts): before a script deletes a transaction, nothing may stay
// payable at Stripe for it and nothing paid may be lost. Stripe is stood in for
// (tests/support/stripe.ts).

vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (original) => (await import('../support/stripe')).fakeStripeAdapterModule(await original()))
vi.mock('@/modules/shop/payments/stripe/status', async () => (await import('../support/stripe')).fakeStatusModule())
vi.mock('@/modules/shop/orders/finalized', () => ({ onOrderFinalized: async () => {} }))

describeWithShop('releasing a payment before its transaction is deleted', () => {
  let test: TestPayload
  let payload: Payload
  let release: typeof import('@/modules/shop/orders/release')
  let payments: typeof import('@/modules/shop/payments/stripe/payments')
  let cartLoad: typeof import('@/modules/shop/cart/load')
  let product: Product

  const address = { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR' }
  const started = async () => {
    const items = [{ product: product.id, quantity: 1 }]
    const cart = await payload.create({ collection: 'carts', data: { items } as Cart, depth: 0, overrideAccess: false })
    const { total } = await cartLoad.priceGuestCart(payload, { items })
    const result = await payments.startStripePayment(payload, { cart: { id: cart.id, secret: cart.secret! }, customerEmail: 'camille@example.com', address, expectedTotal: total })
    if (!result.ok) throw new Error(result.reason)
    return (await payments.findPaymentTransaction(payload, result.paymentIntentId))!
  }
  const reload = (id: number) => payload.findByID({ collection: 'transactions', id, depth: 0, overrideAccess: true })
  const intentStatus = (transaction: { stripe?: { paymentIntentID?: string | null } | null }) => stripe.intents.get(transaction.stripe!.paymentIntentID!)?.status

  beforeAll(async () => {
    test = await startPayload(STRIPE_TEST_ENV)
    payload = test.payload
    release = await import('@/modules/shop/orders/release')
    payments = await import('@/modules/shop/payments/stripe/payments')
    cartLoad = await import('@/modules/shop/cart/load')
    product = await payload.create({ collection: 'products', data: { title: 'Sauge', priceInEUR: 650, inventory: 50, _status: 'published' } as Product, overrideAccess: true })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('cancels at Stripe a payment that can still be paid, then lets it go', async () => {
    const open = await started()
    expect(await release.releasePayment(payload, open)).toMatchObject({ deletable: true, action: 'cancelled' })
    expect(intentStatus(open)).toBe('canceled')
    // Closed here as expired, still open at Stripe: the same.
    const expired = await started()
    await payload.db.updateOne({ collection: 'transactions', id: expired.id, data: { status: 'expired' } })
    expect(await release.releasePayment(payload, await reload(expired.id))).toMatchObject({ deletable: true, action: 'cancelled' })
    expect(intentStatus(expired)).toBe('canceled')
  })

  it('settles a payment paid at Stripe and not here, and keeps it with its new order', async () => {
    const paid = await started()
    stripe.pay(paid.stripe!.paymentIntentID!)
    const result = await release.releasePayment(payload, paid)
    expect(result).toMatchObject({ deletable: false, action: 'settled', orderId: expect.any(Number) })
    expect((await reload(paid.id)).status).toBe('succeeded')
  })

  it('keeps a payment Stripe is still settling, and every payment while Stripe is unreachable', async () => {
    const settling = await started()
    stripe.intents.get(settling.stripe!.paymentIntentID!)!.status = 'processing'
    expect(await release.releasePayment(payload, settling)).toMatchObject({ deletable: false, action: 'kept' })
    const open = await started()
    stripe.unreachable = true
    try {
      expect(await release.releasePayment(payload, open)).toMatchObject({ deletable: false, action: 'kept', reason: expect.stringMatching(/^Stripe:/) })
    } finally {
      stripe.unreachable = false
    }
    expect(intentStatus(open)).toBe('requires_payment_method')
  })

  it('lets go, without asking Stripe, a settled payment and one with no PaymentIntent; and one Stripe doesn’t know', async () => {
    const settled = await started()
    stripe.pay(settled.stripe!.paymentIntentID!)
    await release.releasePayment(payload, settled)
    stripe.unreachable = true
    try {
      expect(await release.releasePayment(payload, await reload(settled.id))).toMatchObject({ deletable: true, action: 'closed' })
      const none = await started()
      await payload.db.updateOne({ collection: 'transactions', id: none.id, data: { stripe: { paymentIntentID: null } } })
      expect(await release.releasePayment(payload, await reload(none.id))).toMatchObject({ deletable: true, action: 'closed', reason: 'no PaymentIntent' })
    } finally {
      stripe.unreachable = false
    }
    const unknown = await started()
    stripe.intents.delete(unknown.stripe!.paymentIntentID!)
    expect(await release.releasePayment(payload, unknown)).toMatchObject({ deletable: true, action: 'closed', reason: 'unknown to Stripe' })
  })
})
