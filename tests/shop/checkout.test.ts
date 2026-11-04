import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'
import { createPayloadRequest, handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cart, Product, Transaction } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

// The checkout's money path, through the real thing: the ecommerce plugin's `initiate` and
// `confirm-order` endpoints, the shop's Stripe wrapper (src/modules/shop/payments/stripe/), the
// Server Action and the return path. Only Stripe itself is stood in for: the plugin's built-in
// adapter keeps its config (the `stripe` group, the webhook endpoint), but its two calls to Stripe
// are replaced by fakes that behave like it. The fake `initiatePayment` charges whatever
// `data.cart.subtotal` it is handed and writes the same pending transaction; the fake
// `confirmOrder` checks the PaymentIntent the way the real one does, then finalizes the order.
// So what the fake "charges" is exactly what Stripe would.

type Intent = { amount: number; status: string; items: unknown[]; shippingAddress: unknown }

const stripe = vi.hoisted(() => ({
  intents: new Map<string, Intent>(),
  next: 0,
  /** Makes the next `confirmOrder` fail after the payment succeeded (settlement trouble). */
  breakSettlement: false,
  /** How many times the plugin's `confirm-order` reached the adapter. */
  confirmCalls: 0,
}))

type InitiateArgs = Parameters<PaymentAdapter['initiatePayment']>[0]
type ConfirmArgs = Parameters<PaymentAdapter['confirmOrder']>[0]

vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (importOriginal) => {
  const real = (await importOriginal()) as { stripeAdapter: (props: unknown) => PaymentAdapter }
  return {
    ...real,
    stripeAdapter: (props: unknown): PaymentAdapter => ({
      ...real.stripeAdapter(props),
      initiatePayment: async ({ data, req, transactionsSlug }: InitiateArgs) => {
        const id = `pi_fake${++stripe.next}`
        const amount = data.cart.subtotal as number
        // Like the real adapter: every property of a line is kept, its id included.
        const items = data.cart.items.map(({ product, variant: _variant, ...rest }) => ({
          ...rest,
          product: typeof product === 'object' ? product.id : product,
        }))
        stripe.intents.set(id, { amount, status: 'requires_payment_method', items, shippingAddress: data.shippingAddress })
        await req.payload.create({
          collection: transactionsSlug as 'transactions',
          data: {
            customerEmail: data.customerEmail,
            amount,
            billingAddress: data.billingAddress,
            cart: data.cart.id as number,
            currency: 'EUR',
            items: items as Transaction['items'],
            paymentMethod: 'stripe',
            status: 'pending',
            stripe: { customerID: 'cus_fake', paymentIntentID: id },
          },
          overrideAccess: true,
          req,
        })
        return { clientSecret: `${id}_secret_fake`, message: 'Payment initiated successfully', paymentIntentID: id }
      },
      confirmOrder: async ({ data, finalizeOrder, req, transactionsSlug }: ConfirmArgs) => {
        stripe.confirmCalls++
        const intent = stripe.intents.get(data.paymentIntentID)
        const { docs } = await req.payload.find({
          collection: transactionsSlug as 'transactions',
          where: { 'stripe.paymentIntentID': { equals: data.paymentIntentID } },
          depth: 0,
          overrideAccess: true,
          req,
        })
        const transaction = docs[0]
        if (!intent || docs.length !== 1 || !transaction) throw new Error('Expected exactly one transaction')
        if (intent.amount !== transaction.amount) throw new Error('Stripe amount does not match the transaction amount')
        if (intent.status !== 'succeeded') throw new Error('Payment not completed.')
        if (stripe.breakSettlement) throw new Error('Something broke during settlement')
        const order = await finalizeOrder({
          orderData: { amount: transaction.amount, currency: transaction.currency, customerEmail: data.customerEmail, items: intent.items, shippingAddress: intent.shippingAddress, status: 'processing' },
          transactionID: transaction.id,
        })
        return { message: 'Order confirmed', orderID: order.id as number, transactionID: transaction.id }
      },
    }),
  }
})

// Where a PaymentIntent stands at "Stripe", for the return path.
vi.mock('@/modules/shop/payments/stripe/status', () => ({
  paymentOutcome: async (id: string) => {
    const status = stripe.intents.get(id)?.status
    if (!status) throw new Error(`No such PaymentIntent: ${id}`)
    return status === 'succeeded' ? 'succeeded' : status === 'processing' ? 'processing' : 'failed'
  },
}))

type Cookie = { value: string; options: Record<string, unknown> }
const jar = new Map<string, Cookie>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => void jar.set(name, { value, options }),
    delete: (arg: string | { name: string }) => void jar.delete(typeof arg === 'string' ? arg : arg.name),
  }),
}))
vi.mock('next/cache', () => ({ refresh: () => {} }))

describeWithShop('checkout: what is charged, and the way back', () => {
  let test: TestPayload
  let payload: Payload
  let actions: typeof import('@/modules/shop/checkout/actions')
  let wrap: typeof import('@/modules/shop/payments/stripe/wrap')
  let confirm: typeof import('@/modules/shop/checkout/confirm')
  let cookie: typeof import('@/modules/shop/cart/cookie')

  type Guest = { id: number; secret: string }
  const SHIPPING = 490

  /** A request to the REST API, as anyone on the internet can send it. */
  const rest = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const url = new URL(`/api${path}`, 'http://localhost')
    const res = await handleEndpoints({
      config: payload.config,
      path: url.pathname,
      request: new Request(url, {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', ...headers },
      }),
    })
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  }

  const publish = (data: Partial<Product>) =>
    payload.create({ collection: 'products', data: { priceInEUR: 790, _status: 'published', ...data } as Product, overrideAccess: true })
  const setProduct = (id: number, data: Partial<Product>) =>
    payload.update({ collection: 'products', id, data: { ...data, _status: 'published' } as Product, overrideAccess: true })

  const newGuest = async (items: { product: number; quantity: number }[]): Promise<Guest> => {
    const cart = await payload.create({ collection: 'carts', data: { items } as Cart, depth: 0, overrideAccess: false })
    return { id: cart.id, secret: cart.secret! }
  }
  /** Puts the cart in the visitor's cookie. */
  const holding = async (guest: Guest) => cookie.saveCartRef(guest)

  const address = { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR' }
  const initiateData = (guest: Guest, extra: Record<string, unknown> = {}) => ({
    cartID: guest.id,
    secret: guest.secret,
    customerEmail: 'camille@example.com',
    shippingAddress: address,
    billingAddress: address,
    ...extra,
  })

  /** The plugin's `initiate` handler, called the way the checkout calls it: in-process, with the checkout's context. */
  const initiate = async (guest: Guest, extra: Record<string, unknown> = {}) => {
    const endpoint = payload.config.endpoints.find((candidate) => candidate.path === '/payments/stripe/initiate' && candidate.method === 'post')!
    const req = await createPayloadRequest({ payload, context: { [wrap.CHECKOUT_CONTEXT]: {} } })
    req.data = initiateData(guest, extra)
    const res = await endpoint.handler(req)
    return { status: res.status, refused: wrap.checkoutContext(req).refused }
  }

  const transactionOf = async (paymentIntentID: string) =>
    (await payload.find({ collection: 'transactions', where: { 'stripe.paymentIntentID': { equals: paymentIntentID } }, overrideAccess: true, depth: 0 })).docs
  const lastCharge = () => [...stripe.intents.entries()].at(-1)

  const details = {
    email: 'camille@example.com',
    firstName: 'Camille',
    lastName: 'Dupré',
    phone: '',
    addressLine1: '12 rue des Claies',
    addressLine2: '',
    postalCode: '26110',
    city: 'Nyons',
    country: 'FR',
  }

  let verveine: Product // 7.90 €, 5 in stock
  let tilleul: Product // 8.50 €, stock not tracked

  beforeAll(async () => {
    // Placeholder keys, so the plugin's webhook endpoint checks signatures. Nothing calls Stripe.
    test = await startPayload({ STRIPE_SECRET_KEY: 'test-placeholder-secret', STRIPE_WEBHOOKS_SIGNING_SECRET: 'test-placeholder-signing' })
    payload = test.payload
    actions = await import('@/modules/shop/checkout/actions')
    wrap = await import('@/modules/shop/payments/stripe/wrap')
    confirm = await import('@/modules/shop/checkout/confirm')
    cookie = await import('@/modules/shop/cart/cookie')
    verveine = await publish({ title: 'Verveine', slug: 'verveine', inventory: 5 })
    tilleul = await publish({ title: 'Tilleul', slug: 'tilleul', priceInEUR: 850, inventory: null })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  beforeEach(async () => {
    jar.clear()
    stripe.breakSettlement = false
    await setProduct(verveine.id, { priceInEUR: 790, priceInEUREnabled: true, inventory: 5 })
  })

  describe('the plugin’s initiate handler, through the wrapper', () => {
    it('charges the lines at their stored prices plus the flat shipping, and stores the split on the transaction', async () => {
      const guest = await newGuest([
        { product: verveine.id, quantity: 2 },
        { product: tilleul.id, quantity: 1 },
      ])
      const res = await initiate(guest)
      expect(res.status).toBe(200)
      const [id, intent] = lastCharge()!
      expect(intent.amount).toBe(2 * 790 + 850 + SHIPPING)

      const [transaction] = await transactionOf(id)
      expect(transaction).toMatchObject({ amount: 2 * 790 + 850 + SHIPPING, subtotal: 2 * 790 + 850, shippingAmount: SHIPPING, status: 'pending' })
      expect(transaction!.subtotal! + transaction!.shippingAmount!).toBe(transaction!.amount)
    })

    it('ignores prices and totals sent with the request, and a tampered cart subtotal', async () => {
      const guest = await newGuest([{ product: tilleul.id, quantity: 2 }])
      // The stored subtotal is the plugin's, written at the last cart change: never what is charged.
      await payload.db.updateOne({ collection: 'carts', id: guest.id, data: { subtotal: 1 } })
      const res = await initiate(guest, {
        amount: 1,
        subtotal: 1,
        total: 1,
        cart: { id: guest.id, subtotal: 1, items: [{ product: tilleul.id, quantity: 2, price: 1 }] },
      })
      expect(res.status).toBe(200)
      expect(lastCharge()![1].amount).toBe(2 * 850 + SHIPPING)
    })

    it('refuses the plugin’s public initiate endpoint: payments start from the checkout only', async () => {
      // Over HTTP the request has no checkout context, so none of the checkout's rules can be skipped.
      const guest = await newGuest([{ product: tilleul.id, quantity: 1 }])
      const before = stripe.intents.size
      for (const extra of [{}, { shippingAddress: { ...address, country: 'US' } }, { shippingAddress: 'not an object' }, { shippingAddress: undefined }]) {
        const res = await rest('/payments/stripe/initiate', initiateData(guest, extra))
        expect(res.status, JSON.stringify(extra)).toBeGreaterThanOrEqual(400)
      }
      expect(stripe.intents.size).toBe(before)
    })

    it.each([
      ['a country the shop does not ship to', { shippingAddress: { ...address, country: 'US' } }],
      ['an address that is not one', { shippingAddress: 'not an object' }],
      ['no address', { shippingAddress: undefined }],
      ['an address missing its city', { shippingAddress: { ...address, city: '' } }],
      ['a malformed email', { customerEmail: 'camille@' }],
    ])('refuses %s, even from the server, and charges nothing', async (_, extra) => {
      const guest = await newGuest([{ product: tilleul.id, quantity: 1 }])
      const before = stripe.intents.size
      const res = await initiate(guest, extra)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.refused).toBe('badAddress')
      expect(stripe.intents.size).toBe(before)
    })

    it('starts a second payment on the same cart (after a decline, a change of address, a reload)', async () => {
      // The plugin copies the cart's line ids into the transaction's lines, whose ids are a
      // primary key: without fresh ids for each attempt, every attempt after the first failed.
      const guest = await newGuest([{ product: tilleul.id, quantity: 1 }])
      expect((await initiate(guest)).status).toBe(200)
      const [first] = lastCharge()!
      expect((await initiate(guest, { shippingAddress: { ...address, addressLine1: '3 place du Marché' } })).status).toBe(200)
      const [second] = lastCharge()!
      expect((await initiate(guest)).status).toBe(200)
      for (const id of [first, second]) {
        const [transaction] = await transactionOf(id)
        expect(transaction).toMatchObject({ status: 'pending', amount: 850 + SHIPPING, subtotal: 850, shippingAmount: SHIPPING })
        expect(transaction!.items).toHaveLength(1)
      }
    })

    it('refuses a line whose product was deleted for good, and charges nothing', async () => {
      const gone = await publish({ title: 'Ortie', slug: 'ortie', priceInEUR: 600, inventory: 10 })
      const guest = await newGuest([
        { product: gone.id, quantity: 1 },
        { product: tilleul.id, quantity: 1 },
      ])
      await payload.delete({ collection: 'products', id: gone.id, overrideAccess: true })
      const before = stripe.intents.size
      expect(await initiate(guest)).toMatchObject({ status: 500, refused: 'cartChanged' })
      expect(stripe.intents.size).toBe(before)
    })

    it('charges today’s price after a price change since the product was added', async () => {
      const guest = await newGuest([{ product: verveine.id, quantity: 2 }])
      await setProduct(verveine.id, { priceInEUR: 990 })
      expect((await initiate(guest)).status).toBe(200)
      expect(lastCharge()![1].amount).toBe(2 * 990 + SHIPPING)
    })

    it('refuses an empty cart, and charges nothing', async () => {
      const guest = await newGuest([])
      const before = stripe.intents.size
      expect((await initiate(guest)).status).toBeGreaterThanOrEqual(400)
      expect(stripe.intents.size).toBe(before)
    })

    it.each([
      ['a line over the stock', { inventory: 1 }],
      ['a sold-out product', { inventory: 0 }],
      ['a product whose price was switched off', { priceInEUREnabled: false }],
    ])('refuses %s since it was added, and charges nothing', async (_, change) => {
      const guest = await newGuest([{ product: verveine.id, quantity: 2 }])
      await setProduct(verveine.id, change)
      const before = stripe.intents.size
      expect((await initiate(guest)).status).toBeGreaterThanOrEqual(400)
      expect(stripe.intents.size).toBe(before)
    })

    it('refuses a product unpublished since it was added (the plugin alone would charge it)', async () => {
      const draft = await publish({ title: 'Mélisse', slug: 'melisse', priceInEUR: 700, inventory: 10 })
      const guest = await newGuest([{ product: draft.id, quantity: 1 }])
      await payload.update({ collection: 'products', id: draft.id, data: { _status: 'draft' }, overrideAccess: true })
      const before = stripe.intents.size
      expect(await initiate(guest)).toMatchObject({ status: 500, refused: 'cartChanged' })
      expect(stripe.intents.size).toBe(before)
    })

    it('refuses a line whose stored quantity is not a whole number', async () => {
      const guest = await newGuest([{ product: tilleul.id, quantity: 1 }])
      const cart = await payload.findByID({ collection: 'carts', id: guest.id, depth: 0, overrideAccess: true })
      await payload.db.updateOne({ collection: 'carts', id: guest.id, data: { items: [{ ...cart.items![0], quantity: 1.5 }] } })
      const before = stripe.intents.size
      expect((await initiate(guest)).status).toBeGreaterThanOrEqual(400)
      expect(stripe.intents.size).toBe(before)
    })

    it('refuses lines that would not fit in Stripe’s metadata, before calling Stripe', async () => {
      // The cart holds at most 8 lines; a cart written before that rule could hold more.
      const many = await Promise.all(Array.from({ length: 9 }, (_, i) => publish({ title: `Lot ${i}`, priceInEUR: 100, inventory: null })))
      const inner = {
        name: 'stripe',
        label: 'Stripe',
        confirmOrder: vi.fn(),
        initiatePayment: vi.fn(async () => ({ message: 'not reached', paymentIntentID: 'pi_unused' })),
      }
      const wrapped = wrap.withCheckoutRules(inner as unknown as PaymentAdapter)
      const attempt = async (count: number) => {
        const req = await createPayloadRequest({ payload, context: { [wrap.CHECKOUT_CONTEXT]: {} } })
        const items = many.slice(0, count).map((product, i) => ({ id: `line${i}`, product, quantity: 1 }))
        const data = { cart: { id: 1, items, currency: 'EUR' }, currency: 'EUR', customerEmail: 'camille@example.com', shippingAddress: address, billingAddress: address }
        const run = wrapped.initiatePayment({ data, req, transactionsSlug: 'transactions' } as unknown as InitiateArgs)
        return { run, req }
      }
      const nine = await attempt(9)
      await expect(nine.run).rejects.toThrow(wrap.PaymentRefusedError)
      expect(wrap.checkoutContext(nine.req).refused).toBe('tooManyLines')
      expect(inner.initiatePayment).not.toHaveBeenCalled()

      // Eight lines fit; the inner adapter gets fresh line ids, never the cart's.
      const eight = await attempt(8)
      await expect(eight.run).rejects.toThrow(/Expected one transaction/) // the stand-in writes none
      expect(inner.initiatePayment).toHaveBeenCalledOnce()
      const handed = (inner.initiatePayment.mock.calls[0] as unknown as [InitiateArgs])[0].data.cart.items
      expect(handed).toHaveLength(8)
      expect(handed.map((item) => item.id)).not.toContain('line0')
      expect(new Set(handed.map((item) => item.id)).size).toBe(8)
      for (const item of handed) expect(item.id).toMatch(/^[0-9a-f]{24}$/)
    })

    it('keeps one transaction per PaymentIntent (a unique index)', async () => {
      const guest = await newGuest([{ product: tilleul.id, quantity: 1 }])
      expect((await initiate(guest)).status).toBe(200)
      const [id] = lastCharge()!
      await expect(
        payload.create({
          collection: 'transactions',
          data: { status: 'pending', paymentMethod: 'stripe', amount: 1, currency: 'EUR', stripe: { customerID: 'cus_fake', paymentIntentID: id } },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
      expect(await transactionOf(id)).toHaveLength(1)
    })
  })

  describe('the checkout’s Server Action', () => {
    it('starts the payment of the cart in the cookie, with the visitor’s email and address', async () => {
      const guest = await newGuest([{ product: verveine.id, quantity: 1 }])
      await holding(guest)
      const result = await actions.startPayment({ details, expectedTotal: 790 + SHIPPING })
      expect(result).toEqual({ ok: true, clientSecret: expect.stringMatching(/_secret_fake$/) })
      const [id, intent] = lastCharge()!
      expect(intent).toMatchObject({
        amount: 790 + SHIPPING,
        shippingAddress: { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR' },
      })
      expect((await transactionOf(id))[0]).toMatchObject({ customerEmail: 'camille@example.com', cart: guest.id, billingAddress: { city: 'Nyons' } })
    })

    it('ignores amounts in its input: the total it was shown only decides whether to go on', async () => {
      const guest = await newGuest([{ product: tilleul.id, quantity: 1 }])
      await holding(guest)
      const tampered = { details: { ...details, total: 1, amount: 1 }, expectedTotal: 850 + SHIPPING, amount: 1 } as Parameters<typeof actions.startPayment>[0]
      expect((await actions.startPayment(tampered)).ok).toBe(true)
      expect(lastCharge()![1].amount).toBe(850 + SHIPPING)

      // A lower total than the cart's is refused, never charged.
      const before = stripe.intents.size
      expect(await actions.startPayment({ details, expectedTotal: 1 })).toEqual({ ok: false, problem: 'cartChanged' })
      expect(stripe.intents.size).toBe(before)
    })

    it('starts again on the same cart after a declined card, and that payment becomes the only order', async () => {
      const guest = await newGuest([{ product: verveine.id, quantity: 1 }])
      await holding(guest)
      expect((await actions.startPayment({ details, expectedTotal: 790 + SHIPPING })).ok).toBe(true)
      const [declined] = lastCharge()!
      // The visitor fixes a typo in the address and tries another card.
      expect((await actions.startPayment({ details: { ...details, addressLine1: '12 rue des Claies, bât. B' }, expectedTotal: 790 + SHIPPING })).ok).toBe(true)
      const [paid] = lastCharge()!
      stripe.intents.get(paid)!.status = 'succeeded'
      expect(await confirm.confirmCheckout(payload, { paymentIntentId: paid, cart: await cookie.readCartRef() })).toMatchObject({ kind: 'order' })

      const [paidTransaction] = await transactionOf(paid)
      const linked = await payload.find({ collection: 'orders', where: { transactions: { equals: paidTransaction!.id } }, overrideAccess: true, depth: 0 })
      expect(linked.totalDocs).toBe(1)
      expect(linked.docs[0]).toMatchObject({ amount: 790 + SHIPPING })
      expect((await transactionOf(declined))[0]).toMatchObject({ status: 'pending', order: null })
    })

    it('sends the visitor back to the cart when a line ran out since the page was drawn', async () => {
      const guest = await newGuest([{ product: verveine.id, quantity: 3 }])
      await holding(guest)
      await setProduct(verveine.id, { inventory: 2 })
      const before = stripe.intents.size
      expect(await actions.startPayment({ details, expectedTotal: 3 * 790 + SHIPPING })).toEqual({ ok: false, problem: 'cartChanged' })
      expect(stripe.intents.size).toBe(before)
    })

    it('starts nothing without a cart, or with a country the shop does not ship to', async () => {
      const before = stripe.intents.size
      expect(await actions.startPayment({ details, expectedTotal: 790 + SHIPPING })).toEqual({ ok: false, problem: 'cartChanged' })
      await holding(await newGuest([{ product: verveine.id, quantity: 1 }]))
      expect(await actions.startPayment({ details: { ...details, country: 'DE' }, expectedTotal: 790 + SHIPPING })).toEqual({
        ok: false,
        problem: 'invalid',
        fields: { country: 'notShipped' },
      })
      expect(stripe.intents.size).toBe(before)
    })
  })

  describe('the way back from Stripe', () => {
    /** A started payment for the visitor's cart: its PaymentIntent ID. */
    const startedPayment = async (items: { product: number; quantity: number }[]) => {
      const guest = await newGuest(items)
      await holding(guest)
      const pricing = await (await import('@/modules/shop/cart/load')).priceGuestCart(payload, { items })
      expect((await actions.startPayment({ details, expectedTotal: pricing.total })).ok).toBe(true)
      return { guest, id: lastCharge()![0] }
    }
    const back = async (id: unknown) => confirm.confirmCheckout(payload, { paymentIntentId: id, cart: await cookie.readCartRef() })

    it('creates the order once the payment succeeded, marks the cart bought, and lowers the stock once', async () => {
      const { guest, id } = await startedPayment([{ product: verveine.id, quantity: 2 }])
      stripe.intents.get(id)!.status = 'succeeded'

      const first = await back(id)
      expect(first).toMatchObject({ kind: 'order', orderId: expect.anything() })
      // Again (a reload of the return URL): the same order, nothing new.
      expect(await back(id)).toEqual(first)

      const orders = await payload.find({ collection: 'orders', where: { transactions: { equals: (await transactionOf(id))[0]!.id } }, overrideAccess: true })
      expect(orders.totalDocs).toBe(1)
      expect(orders.docs[0]).toMatchObject({ amount: 2 * 790 + SHIPPING, customerEmail: 'camille@example.com' })
      expect((await payload.findByID({ collection: 'carts', id: guest.id, overrideAccess: true })).purchasedAt).toBeTruthy()
      expect((await payload.findByID({ collection: 'products', id: verveine.id, overrideAccess: true })).inventory).toBe(3)
    })

    it('keeps the cart when the payment did not go through (a declined card), so the visitor can try again', async () => {
      const { guest, id } = await startedPayment([{ product: tilleul.id, quantity: 1 }])
      const calls = stripe.confirmCalls
      expect(await back(id)).toEqual({ kind: 'failed' })
      // Stripe is asked first: an unpaid payment never goes through the plugin's settlement.
      expect(stripe.confirmCalls).toBe(calls)
      expect((await payload.findByID({ collection: 'carts', id: guest.id, overrideAccess: true })).purchasedAt).toBeFalsy()
      expect(confirm.outcomePath('fr', { kind: 'failed' })).toBe('/fr/checkout?payment=failed')
    })

    it('says "payment received" when the payment succeeded but the order could not be created here', async () => {
      const { id } = await startedPayment([{ product: tilleul.id, quantity: 1 }])
      stripe.intents.get(id)!.status = 'succeeded'
      stripe.breakSettlement = true
      expect(await back(id)).toEqual({ kind: 'received' })
      expect(confirm.outcomePath('en', { kind: 'received' })).toBe('/en/checkout/received')
    })

    it('tells a browser without the payment’s cart only whether it went through, never the order', async () => {
      const { id } = await startedPayment([{ product: tilleul.id, quantity: 1 }])
      stripe.intents.get(id)!.status = 'succeeded'
      expect(await back(id)).toMatchObject({ kind: 'order' })
      jar.clear()
      await holding(await newGuest([{ product: tilleul.id, quantity: 1 }]))
      expect(await back(id)).toEqual({ kind: 'received' })
      jar.clear()
      expect(await back(id)).toEqual({ kind: 'received' })
    })

    it('knows nothing of a PaymentIntent the shop did not start', async () => {
      expect(await back('pi_unknown123')).toEqual({ kind: 'unknown' })
      expect(await back('not-a-payment')).toEqual({ kind: 'unknown' })
      expect(await back(['pi_fake1'])).toEqual({ kind: 'unknown' })
    })

    it('has today’s webhook: unsigned 200, bad signature 400, nothing written either way (S18 refuses unsigned)', async () => {
      const count = async () => ({
        orders: (await payload.count({ collection: 'orders', overrideAccess: true })).totalDocs,
        transactions: (await payload.count({ collection: 'transactions', overrideAccess: true })).totalDocs,
      })
      const before = await count()
      const event = JSON.stringify({ id: 'evt_fake', type: 'payment_intent.succeeded', data: { object: { id: 'pi_fake1' } } })
      expect((await rest('/payments/stripe/webhooks', event)).status).toBe(200)
      expect((await rest('/payments/stripe/webhooks', event, { 'stripe-signature': 't=1,v1=bad' })).status).toBe(400)
      expect(await count()).toEqual(before)
    })

    it('goes to the order page with its access token, once orders have one', () => {
      expect(confirm.outcomePath('fr', { kind: 'order', orderId: 12, accessToken: 'abc' })).toBe('/fr/order/12?token=abc')
      // Until S18 adds the token, the order can't be shown: "payment received".
      expect(confirm.outcomePath('fr', { kind: 'order', orderId: 12, accessToken: null })).toBe('/fr/checkout/received')
    })
  })
})
