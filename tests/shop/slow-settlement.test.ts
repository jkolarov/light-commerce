import { handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import type { Cart, Product } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { STRIPE_TEST_ENV, stripe, stripeSignature, succeededEvent } from '../support/stripe'

// The browser comes back while Stripe's webhook is settling the same payment, and the webhook is
// slow: the plugin's losing call waits only 500 ms, then gives up. The browser waits a little
// longer (read-only), so it still lands on the order's page rather than "payment received".

vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (original) => (await import('../support/stripe')).fakeStripeAdapterModule(await original()))
vi.mock('@/modules/shop/payments/stripe/status', async () => (await import('../support/stripe')).fakeStatusModule())

// A slow settlement: the plugin's own cart write (`purchasedAt`), inside the settlement, takes a while.
const slow = vi.hoisted(() => ({ ms: 0 }))
vi.mock('@/modules/shop/cart/checkItems', async (original) => {
  const real = (await original()) as typeof import('@/modules/shop/cart/checkItems')
  return {
    ...real,
    checkCartItems: async (args: Parameters<typeof real.checkCartItems>[0]) => {
      if (slow.ms && args.data?.purchasedAt) await new Promise((resolve) => setTimeout(resolve, slow.ms))
      return real.checkCartItems(args)
    },
  }
})

describeWithShop('a browser that comes back during a slow settlement', () => {
  let test: TestPayload
  let payload: Payload

  beforeAll(async () => {
    test = await startPayload(STRIPE_TEST_ENV)
    payload = test.payload
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('lands on the order’s page once the webhook finishes, not on "payment received"', async () => {
    const payments = await import('@/modules/shop/payments/stripe/payments')
    const confirm = await import('@/modules/shop/checkout/confirm')
    const { priceGuestCart } = await import('@/modules/shop/cart/load')
    const product = await payload.create({ collection: 'products', data: { title: 'Lente', priceInEUR: 700, inventory: 5, _status: 'published' } as Product, overrideAccess: true })
    const items = [{ product: product.id, quantity: 1 }]
    const created = await payload.create({ collection: 'carts', data: { items } as Cart, depth: 0, overrideAccess: false })
    const cart = { id: created.id, secret: created.secret! }
    const address = { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR' }
    const started = await payments.startStripePayment(payload, { cart, customerEmail: 'camille@example.com', address, expectedTotal: (await priceGuestCart(payload, { items })).total })
    if (!started.ok) throw new Error(started.reason)
    const id = started.paymentIntentId
    stripe.pay(id)

    slow.ms = 1200
    try {
      const body = succeededEvent(id)
      const url = new URL('/api/payments/stripe/webhooks', 'http://localhost')
      const webhook = handleEndpoints({
        config: payload.config,
        path: url.pathname,
        request: new Request(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(body) } }),
      })
      await new Promise((resolve) => setTimeout(resolve, 100)) // the webhook claims first
      const startedAt = Date.now()
      const outcome = await confirm.confirmCheckout(payload, { paymentIntentId: id, cart })
      expect((await webhook).status).toBe(200)
      expect(outcome).toMatchObject({ kind: 'order', accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) })
      // It waited for the winner, within its bound.
      expect(Date.now() - startedAt).toBeLessThan(500 + confirm.SETTLEMENT_WAIT_MS + 1000)
    } finally {
      slow.ms = 0
    }
  })
})
