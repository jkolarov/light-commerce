import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'
import { handleEndpoints, type Payload } from 'payload'
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
  let confirm: typeof import('@/modules/shop/checkout/confirm')
  let cookie: typeof import('@/modules/shop/cart/cookie')

  type Guest = { id: number; secret: string }
  const SHIPPING = 490

  const rest = async (path: string, body: unknown) => {
    const url = new URL(`/api${path}`, 'http://localhost')
    const res = await handleEndpoints({
      config: payload.config,
      path: url.pathname,
      request: new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
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

  const initiate = (guest: Guest, extra: Record<string, unknown> = {}) =>
    rest('/payments/stripe/initiate', { cartID: guest.id, secret: guest.secret, customerEmail: 'camille@example.com', ...extra })

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
    test = await startPayload()
    payload = test.payload
    actions = await import('@/modules/shop/checkout/actions')
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

  describe('the plugin’s initiate endpoint, through the wrapper', () => {
    it('charges the lines at their stored prices plus the flat shipping, and stores the split on the transaction', async () => {
      const guest = await newGuest([
        { product: verveine.id, quantity: 2 },
        { product: tilleul.id, quantity: 1 },
      ])
      const res = await initiate(guest)
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(res.body).toMatchObject({ clientSecret: expect.stringMatching(/^pi_fake\d+_secret_fake$/) })
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
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(lastCharge()![1].amount).toBe(2 * 850 + SHIPPING)
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
      expect((await initiate(guest)).status).toBe(500)
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
      expect(await back(id)).toEqual({ kind: 'failed' })
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

    it('goes to the order page with its access token, once orders have one', () => {
      expect(confirm.outcomePath('fr', { kind: 'order', orderId: 12, accessToken: 'abc' })).toBe('/fr/order/12?token=abc')
      // Until S18 adds the token, the order can't be shown: "payment received".
      expect(confirm.outcomePath('fr', { kind: 'order', orderId: 12, accessToken: null })).toBe('/fr/checkout/received')
    })
  })
})
