import { handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cart, Order, Product, User } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { STRIPE_TEST_ENV, stripe, stripeSignature, succeededEvent } from '../support/stripe'

// Orders (S18): one payment, one order, every time (Review focus #1), stock never below 0 and the
// order flagged when it ran out (Review focus #3), Stripe's webhook as the source of truth, and
// the admin's rules for orders. Through the real thing: the plugin's `initiate` and
// `confirm-order` handlers, its atomic claim, the shop's wrapper and webhook endpoint. Only
// Stripe's own calls are stood in for (tests/support/stripe.ts), and webhook events are the one
// recorded in test mode, signed like Stripe signs them.

vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (original) => (await import('../support/stripe')).fakeStripeAdapterModule(await original()))
vi.mock('@/modules/shop/payments/stripe/status', async () => (await import('../support/stripe')).fakeStatusModule())

describeWithShop('orders from payments', () => {
  let test: TestPayload
  let payload: Payload
  let finalize: typeof import('@/modules/shop/orders/finalizePayment')
  let payments: typeof import('@/modules/shop/payments/stripe/payments')
  let cartLoad: typeof import('@/modules/shop/cart/load')
  let staff: User

  const SHIPPING = 490
  const address = { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR' }

  const publish = (data: Partial<Product>) =>
    payload.create({ collection: 'products', data: { priceInEUR: 790, _status: 'published', ...data } as Product, overrideAccess: true })
  const stock = async (id: number) => (await payload.findByID({ collection: 'products', id, overrideAccess: true })).inventory
  const setStock = (id: number, inventory: number) => payload.db.updateOne({ collection: 'products', id, data: { inventory } })

  /** A guest's cart, and a payment started for it the way the checkout starts one. */
  const newCart = async (items: { product: number; quantity: number }[]) => {
    const created = await payload.create({ collection: 'carts', data: { items } as Cart, depth: 0, overrideAccess: false })
    return { id: created.id, secret: created.secret! }
  }
  const startedPayment = async (items: { product: number; quantity: number }[], cart?: { id: number; secret: string }) => {
    const guest = cart ?? (await newCart(items))
    const { total } = await cartLoad.priceGuestCart(payload, { items })
    const started = await payments.startStripePayment(payload, { cart: guest, customerEmail: 'camille@example.com', address, expectedTotal: total })
    if (!started.ok) throw new Error(`payment not started: ${started.reason}`)
    return { cart: guest, id: started.paymentIntentId }
  }

  /** Stripe's webhook, as Stripe sends it (or not quite). */
  const webhook = async (body: string, signature: string | null = stripeSignature(body)) => {
    const url = new URL('/api/payments/stripe/webhooks', 'http://localhost')
    const res = await handleEndpoints({
      config: payload.config,
      path: url.pathname,
      request: new Request(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) } }),
    })
    return res.status
  }

  const ordersOf = async (paymentIntentId: string) => {
    const transaction = await payments.findPaymentTransaction(payload, paymentIntentId)
    const { docs } = await payload.find({ collection: 'orders', where: { transactions: { equals: transaction!.id } }, overrideAccess: true, depth: 0 })
    return docs
  }
  const count = async () => ({
    orders: (await payload.count({ collection: 'orders', overrideAccess: true })).totalDocs,
    transactions: (await payload.count({ collection: 'transactions', overrideAccess: true })).totalDocs,
  })

  beforeAll(async () => {
    test = await startPayload(STRIPE_TEST_ENV)
    payload = test.payload
    finalize = await import('@/modules/shop/orders/finalizePayment')
    payments = await import('@/modules/shop/payments/stripe/payments')
    cartLoad = await import('@/modules/shop/cart/load')
    // The first user is always an owner (src/core/collections/Users.ts); the staff member comes second.
    await payload.create({ collection: 'users', data: { email: 'owner@example.com', password: 'pw-owner-1', roles: ['owner'] }, overrideAccess: true })
    staff = await payload.create({ collection: 'users', data: { email: 'staff@example.com', password: 'pw-staff-1', roles: ['staff'] }, overrideAccess: true })
    expect(staff.roles).toEqual(['staff'])
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  beforeEach(() => {
    stripe.breakSettlement = false
  })

  describe('one payment, one order', () => {
    it('creates the order from the webhook alone (the browser never came back), with what was charged', async () => {
      const product = await publish({ title: 'Verveine', inventory: 10 })
      const { cart, id } = await startedPayment([{ product: product.id, quantity: 2 }])
      stripe.pay(id)
      expect(await webhook(succeededEvent(id))).toBe(200)

      const [order, ...more] = await ordersOf(id)
      expect(more).toHaveLength(0)
      expect(order).toMatchObject({
        amount: 2 * 790 + SHIPPING,
        subtotal: 2 * 790,
        shippingAmount: SHIPPING,
        customerEmail: 'camille@example.com',
        status: 'processing',
        needsAttention: false,
        shippingAddress: { firstName: 'Camille', city: 'Nyons', country: 'FR' },
        linePrices: [{ product: String(product.id), quantity: 2, unitPrice: 790, lineTotal: 1580 }],
      })
      expect(order!.subtotal! + order!.shippingAmount!).toBe(order!.amount)
      expect(order!.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(await stock(product.id)).toBe(8)
      expect((await payload.findByID({ collection: 'carts', id: cart.id, overrideAccess: true })).purchasedAt).toBeTruthy()
    })

    it('keeps one order when the webhook is sent again, and when the browser comes back before or after it', async () => {
      const product = await publish({ title: 'Tilleul', inventory: 10 })
      for (const order of ['browser first', 'webhook first'] as const) {
        const { id } = await startedPayment([{ product: product.id, quantity: 1 }])
        stripe.pay(id)
        const browser = () => finalize.finalizePayment(payload, id)
        if (order === 'browser first') await browser()
        expect(await webhook(succeededEvent(id))).toBe(200)
        expect(await webhook(succeededEvent(id))).toBe(200) // Stripe resends
        if (order === 'webhook first') await browser()
        expect(await ordersOf(id), order).toHaveLength(1)
      }
      expect(await stock(product.id)).toBe(8)
    })

    it.each([6, 12])('makes one order, and lowers the stock once, when %i confirmations race', async (n) => {
      const product = await publish({ title: `Course ${n}`, inventory: 5 })
      const { id } = await startedPayment([{ product: product.id, quantity: 1 }])
      stripe.pay(id)
      const calls = Array.from({ length: n }, (_, i) => (i % 2 ? webhook(succeededEvent(id)) : finalize.finalizePayment(payload, id).then(({ order }) => order.id)))
      const results = await Promise.allSettled(calls)
      const [order, ...more] = await ordersOf(id)
      expect(more).toHaveLength(0)
      // Every call either got the one order (a webhook: 200) or lost the plugin's 500 ms wait for
      // the winner (a webhook: 500, which Stripe retries; a direct call: PaymentNotSettledError).
      for (const [i, result] of results.entries()) {
        if (i % 2) expect([200, 500], `webhook ${i}`).toContain(result.status === 'fulfilled' ? result.value : 'rejected')
        else if (result.status === 'fulfilled') expect(result.value, `call ${i}`).toBe(order!.id)
        else expect(result.reason, `call ${i}`).toBeInstanceOf(finalize.PaymentNotSettledError)
      }
      const settledCalls = results.filter((result, i) => result.status === 'fulfilled' && (i % 2 ? result.value === 200 : true))
      expect(settledCalls.length).toBeGreaterThanOrEqual(1)
      expect(await stock(product.id)).toBe(4)
      // Every call after the race gets the same order.
      expect((await finalize.finalizePayment(payload, id)).order.id).toBe(order!.id)
    })

    it('answers 200 to a late webhook for an order the owner deleted, and changes nothing', async () => {
      const product = await publish({ title: 'Supprimée', inventory: 5 })
      const { id } = await startedPayment([{ product: product.id, quantity: 1 }])
      stripe.pay(id)
      const { order } = await finalize.finalizePayment(payload, id)
      await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
      await expect(finalize.finalizePayment(payload, id)).rejects.toThrow(finalize.OrderDeletedError)
      expect(await webhook(succeededEvent(id))).toBe(200)
      expect(await ordersOf(id)).toHaveLength(0)
      expect(await stock(product.id)).toBe(4)
    })

    it('ignores a payment the shop did not start, and refuses to settle one that is not paid', async () => {
      const before = await count()
      expect(await webhook(succeededEvent('pi_someoneelse'))).toBe(200)
      const product = await publish({ title: 'Mauve', inventory: 3 })
      const { id } = await startedPayment([{ product: product.id, quantity: 1 }])
      await expect(finalize.finalizePayment(payload, id)).rejects.toThrow(finalize.PaymentNotSettledError)
      expect(await webhook(succeededEvent(id))).toBe(500) // Stripe will send it again
      expect((await count()).orders).toBe(before.orders)
      expect(await stock(product.id)).toBe(3)
    })
  })

  describe('the webhook’s signature', () => {
    it('refuses an unsigned event, or a badly signed one (400), and writes nothing', async () => {
      const product = await publish({ title: 'Sans signature', inventory: 3 })
      const { id } = await startedPayment([{ product: product.id, quantity: 1 }])
      stripe.pay(id)
      const before = await count()
      const body = succeededEvent(id)
      expect(await webhook(body, null)).toBe(400)
      expect(await webhook(body, 't=1,v1=bad')).toBe(400)
      expect(await webhook(body, stripeSignature(body, 'another-secret'))).toBe(400)
      expect(await webhook(body, stripeSignature(body, undefined, Math.floor(Date.now() / 1000) - 3600))).toBe(400) // too old
      const tampered = body.replace('"amount":2490', '"amount":1')
      expect(tampered).not.toBe(body)
      expect(await webhook(tampered, stripeSignature(body))).toBe(400) // changed after signing
      expect(await count()).toEqual(before)
      expect(await stock(product.id)).toBe(3)
    })

    it('answers 200 to the events it does not handle', async () => {
      const body = succeededEvent('pi_fake_other').replace('"type":"payment_intent.succeeded"', '"type":"payment_intent.created"')
      expect(body).toContain('"type":"payment_intent.created"')
      const before = await count()
      expect(await webhook(body)).toBe(200)
      expect(await count()).toEqual(before)
    })
  })

  describe('the last item in stock', () => {
    it('makes both orders when two carts paid for the last unit, flags the one that ran out, and keeps stock at 0', async () => {
      const product = await publish({ title: 'Dernier sachet', inventory: 1 })
      const first = await startedPayment([{ product: product.id, quantity: 1 }])
      const second = await startedPayment([{ product: product.id, quantity: 1 }])
      stripe.pay(first.id)
      stripe.pay(second.id)
      expect(await webhook(succeededEvent(first.id))).toBe(200)
      expect(await webhook(succeededEvent(second.id))).toBe(200)

      const [a] = await ordersOf(first.id)
      const [b] = await ordersOf(second.id)
      expect(a).toMatchObject({ needsAttention: false })
      expect(b).toMatchObject({ needsAttention: true })
      expect(b!.attentionNote).toMatch(/Dernier sachet/)
      expect(b!.attentionNote).toMatch(/remis à 0/)
      expect(await stock(product.id)).toBe(0)
    })

    it('flags every order of a race for the last unit that it could see running out, and never leaves stock below 0', async () => {
      const product = await publish({ title: 'Ruée', inventory: 1 })
      const started = await Promise.all(Array.from({ length: 3 }, () => startedPayment([{ product: product.id, quantity: 1 }])))
      for (const { id } of started) stripe.pay(id)
      await Promise.allSettled(started.map(({ id }) => webhook(succeededEvent(id))))
      for (const { id } of started) if ((await ordersOf(id)).length === 0) await finalize.finalizePayment(payload, id) // a loser retried
      const orders = (await Promise.all(started.map(({ id }) => ordersOf(id)))).flat()
      expect(orders).toHaveLength(3)
      expect(await stock(product.id)).toBe(0)
      // Two oversold; at least one is flagged (both, unless their decrements landed together).
      expect(orders.filter((order) => order.needsAttention).length).toBeGreaterThanOrEqual(1)
    })

    it('still makes the order when stock ran out after the payment started (a reused payment skips the check)', async () => {
      const product = await publish({ title: 'Épuisé', inventory: 2 })
      const { id } = await startedPayment([{ product: product.id, quantity: 2 }])
      await setStock(product.id, 0)
      stripe.pay(id)
      expect(await webhook(succeededEvent(id))).toBe(200)
      const [order] = await ordersOf(id)
      expect(order).toMatchObject({ needsAttention: true })
      expect(order!.attentionNote).toMatch(/Stock insuffisant.*2 × Épuisé.*0 en stock/)
      expect(await stock(product.id)).toBe(0)
      // The product saves again: S13 refuses a save with stock below 0.
      await expect(payload.update({ collection: 'products', id: product.id, data: { title: 'Épuisé (bientôt)' }, overrideAccess: true })).resolves.toBeTruthy()
    })

    it('never lets a late confirmation flag its own order for another one’s oversell', async () => {
      const product = await publish({ title: 'Tardive', inventory: 5 })
      const { cart, id } = await startedPayment([{ product: product.id, quantity: 1 }])
      stripe.pay(id)
      const { order } = await finalize.finalizePayment(payload, id)
      // Another payment is taking the stock below 0 right now; this one's confirmation comes again
      // (the plugin's public confirm-order, a browser coming back).
      await setStock(product.id, -1)
      const late = await payments.confirmStripePayment(payload, { cart, customerEmail: 'camille@example.com', paymentIntentId: id })
      expect(late).toMatchObject({ ok: true, orderId: order.id })
      expect(await payload.findByID({ collection: 'orders', id: order.id, overrideAccess: true })).toMatchObject({ needsAttention: false })
      // The other payment's own winning call sets it back.
      await setStock(product.id, 4)
    })

    it('makes both orders when two tabs paid for one cart (two payments are two orders)', async () => {
      const product = await publish({ title: 'Deux onglets', inventory: 10 })
      const first = await startedPayment([{ product: product.id, quantity: 1 }])
      const second = await startedPayment([{ product: product.id, quantity: 1 }], first.cart)
      stripe.pay(first.id)
      stripe.pay(second.id)
      expect(await webhook(succeededEvent(first.id))).toBe(200)
      // The cart is bought now; the second payment still settles.
      expect(await webhook(succeededEvent(second.id))).toBe(200)
      expect(await ordersOf(first.id)).toHaveLength(1)
      expect(await ordersOf(second.id)).toHaveLength(1)
      expect(await stock(product.id)).toBe(8)
    })
  })

  describe('in the admin', () => {
    const asStaff = () => ({ ...staff, collection: 'users' as const })

    const paidOrder = async (): Promise<Order> => {
      const product = await publish({ title: 'Admin', inventory: 5 })
      const { id } = await startedPayment([{ product: product.id, quantity: 1 }])
      stripe.pay(id)
      return (await finalize.finalizePayment(payload, id)).order
    }

    it('lets staff move an order along and clear its flag, but not change what was bought or paid', async () => {
      const order = await paidOrder()
      const updated = await payload.update({
        collection: 'orders',
        id: order.id,
        data: { status: 'shipped', needsAttention: false, amount: 1, subtotal: 1, customerEmail: 'other@example.com', accessToken: 'guessable', items: [] },
        overrideAccess: false,
        user: asStaff(),
      })
      expect(updated).toMatchObject({ status: 'shipped', amount: order.amount, subtotal: order.subtotal, customerEmail: order.customerEmail })
      expect(updated.items).toHaveLength(1)
      const stored = await payload.findByID({ collection: 'orders', id: order.id, overrideAccess: true })
      expect(stored.accessToken).toBe(order.accessToken)
      await payload.update({ collection: 'orders', id: order.id, data: { status: 'refunded' }, overrideAccess: false, user: asStaff() })
    })

    it('keeps an order’s date and status: an update can’t rewrite or clear them', async () => {
      const order = await paidOrder()
      const updated = await payload.update({
        collection: 'orders',
        id: order.id,
        data: { createdAt: '2000-01-01T00:00:00.000Z', status: null } as unknown as Order,
        overrideAccess: false,
        user: asStaff(),
      })
      expect(updated.createdAt).toBe(order.createdAt)
      expect(updated.status).toBe('processing')
    })

    it('refuses to delete for good a product that an order bought or a payment is for; the trash still works', async () => {
      const bought = await publish({ title: 'Achetée', inventory: 5 })
      const { id } = await startedPayment([{ product: bought.id, quantity: 1 }])
      const pending = await publish({ title: 'En cours', inventory: 5 })
      await startedPayment([{ product: pending.id, quantity: 1 }])
      stripe.pay(id)
      await finalize.finalizePayment(payload, id)
      for (const product of [bought, pending]) {
        await expect(payload.delete({ collection: 'products', id: product.id, overrideAccess: false, user: asStaff() }), String(product.title)).rejects.toThrow(/trash/)
        const rest = await handleEndpoints({ config: payload.config, path: `/api/products/${product.id}`, request: new Request(`http://localhost/api/products/${product.id}`, { method: 'DELETE' }) })
        expect(rest.status).toBeGreaterThanOrEqual(400)
        expect(await stock(product.id)).not.toBeUndefined()
      }
      // Moving it to the trash keeps its row, and the order its line.
      await payload.update({ collection: 'products', id: bought.id, data: { deletedAt: new Date().toISOString() }, overrideAccess: false, user: asStaff() })
      expect((await ordersOf(id))[0]!.items).toEqual([expect.objectContaining({ product: bought.id })])
      // A product nobody bought still goes.
      const unsold = await publish({ title: 'Jamais vendue', inventory: 5 })
      await expect(payload.delete({ collection: 'products', id: unsold.id, overrideAccess: false, user: asStaff() })).resolves.toBeTruthy()
    })

    it('refuses a guest’s delete of a cart whose payment is being settled', async () => {
      const product = await publish({ title: 'Panier gardé', inventory: 5 })
      const { cart } = await startedPayment([{ product: product.id, quantity: 1 }])
      const res = await handleEndpoints({
        config: payload.config,
        path: `/api/carts/${cart.id}`,
        request: new Request(`http://localhost/api/carts/${cart.id}?secret=${cart.secret}`, { method: 'DELETE' }),
      })
      expect(res.status).toBe(400)
      expect(await payload.findByID({ collection: 'carts', id: cart.id, overrideAccess: true, disableErrors: true })).not.toBeNull()
    })

    it('lets nobody create an order by hand, and only the owner delete one', async () => {
      await expect(payload.create({ collection: 'orders', data: { amount: 1 } as Order, overrideAccess: false, user: asStaff() })).rejects.toThrow()
      const order = await paidOrder()
      await expect(payload.delete({ collection: 'orders', id: order.id, overrideAccess: false, user: asStaff() })).rejects.toThrow()
    })

    it('never shows the access token to the public, and gives every order its own', async () => {
      const [a, b] = [await paidOrder(), await paidOrder()]
      expect(a.accessToken).not.toBe(b.accessToken)
      const res = await handleEndpoints({ config: payload.config, path: `/api/orders/${a.id}`, request: new Request(`http://localhost/api/orders/${a.id}`) })
      expect(res.status).toBeGreaterThanOrEqual(400)
      const created = await payload.create({ collection: 'orders', data: { amount: 1, accessToken: 'chosen-by-caller' } as Order, overrideAccess: true })
      expect(created.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    })
  })
})
