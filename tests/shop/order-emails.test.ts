import { handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cart, Order, Product } from '@/payload-types'

import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { STRIPE_TEST_ENV, stripe, stripeSignature, succeededEvent } from '../support/stripe'

// Sending the order emails (S19): once per order, whichever path settles it and however often
// (the browser's return, Stripe's webhook and its retries, the reconcile job), after the
// settlement and never inside it, in the buyer's language, and a failing transport never fails or
// undoes the order. Payments go through the real plugin endpoints and the shop's wrapper; only
// Stripe's calls are stood in for (tests/support/stripe.ts). `payload.sendEmail` is replaced by a
// fake transport that records what would have gone out.

vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (original) => (await import('../support/stripe')).fakeStripeAdapterModule(await original()))
vi.mock('@/modules/shop/payments/stripe/status', async () => (await import('../support/stripe')).fakeStatusModule())

// Next's `after`: outside a request it throws, as the real one does, unless a test captures the task.
const afterTasks: (() => Promise<unknown>)[] = []
const outsideRequest = (): void => {
  throw new Error('`after` was called outside a request scope.')
}
const after = vi.fn<(task: () => Promise<unknown>) => void>(outsideRequest)
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: (task: () => Promise<unknown>) => after(task) }))

// The checkout's Server Action reads the cart from the cookie.
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (arg: string | { name: string }) => void jar.delete(typeof arg === 'string' ? arg : arg.name),
  }),
}))
vi.mock('next/cache', () => ({ refresh: () => {} }))

type Sent = { to: string; subject: string; html: string; text: string; replyTo?: string }

describeWithShop('order emails: sent once per order, after the settlement', () => {
  let test: TestPayload
  let payload: Payload
  let finalize: typeof import('@/modules/shop/orders/finalizePayment')
  let finalized: typeof import('@/modules/shop/orders/finalized')
  let payments: typeof import('@/modules/shop/payments/stripe/payments')
  let cartLoad: typeof import('@/modules/shop/cart/load')
  let actions: typeof import('@/modules/shop/checkout/actions')
  let config: ReturnType<typeof import('@/config').getLightConfig>

  const address = { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR' }

  /** The fake transport: what went out, and a way to make it fail. */
  let sent: Sent[] = []
  let failFor: (message: Sent) => boolean = () => false
  /** Called as each email is handed to the transport, to look at the database at that moment. */
  let onSend: (message: Sent) => Promise<void> = async () => {}

  const publish = (data: Partial<Product>) =>
    payload.create({ collection: 'products', data: { priceInEUR: 790, inventory: 50, _status: 'published', ...data } as Product, overrideAccess: true })

  const newCart = async (items: { product: number; quantity: number }[]) => {
    const created = await payload.create({ collection: 'carts', data: { items } as Cart, depth: 0, overrideAccess: false })
    return { id: created.id, secret: created.secret! }
  }
  /** A payment started the way the checkout starts one, in `locale`, and paid at "Stripe". */
  const paid = async (product: Product, locale?: 'fr' | 'en', customerEmail = 'camille@example.com') => {
    const items = [{ product: product.id, quantity: 2 }]
    const cart = await newCart(items)
    const { total } = await cartLoad.priceGuestCart(payload, { items })
    const started = await payments.startStripePayment(payload, { cart, customerEmail, address, expectedTotal: total, locale })
    if (!started.ok) throw new Error(`payment not started: ${started.reason}`)
    stripe.pay(started.paymentIntentId)
    return { id: started.paymentIntentId, cart }
  }

  const webhook = async (body: string) => {
    const url = new URL('/api/payments/stripe/webhooks', 'http://localhost')
    const res = await handleEndpoints({
      config: payload.config,
      path: url.pathname,
      request: new Request(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(body) } }),
    })
    return res.status
  }

  const reload = (order: Order) => payload.findByID({ collection: 'orders', id: order.id, depth: 0, overrideAccess: true })
  const sentFor = (order: Order) => sent.filter((message) => message.subject.includes(String(order.id)))
  const toBuyer = (order: Order) => sentFor(order).filter((message) => message.to === order.customerEmail)
  const toOwner = (order: Order) => sentFor(order).filter((message) => message.to === config.email.ownerNotificationsTo)

  beforeAll(async () => {
    test = await startPayload(STRIPE_TEST_ENV)
    payload = test.payload
    finalize = await import('@/modules/shop/orders/finalizePayment')
    finalized = await import('@/modules/shop/orders/finalized')
    payments = await import('@/modules/shop/payments/stripe/payments')
    cartLoad = await import('@/modules/shop/cart/load')
    actions = await import('@/modules/shop/checkout/actions')
    config = (await import('@/config')).getLightConfig()
    vi.spyOn(payload, 'sendEmail').mockImplementation(async (message) => {
      const email = message as Sent
      await onSend(email)
      if (failFor(email)) throw new Error('SMTP: 451 try again later')
      sent.push(email)
      return {}
    })
    vi.spyOn(payload.logger, 'error').mockImplementation(() => {})
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  beforeEach(() => {
    sent = []
    failFor = () => false
    onSend = async () => {}
    afterTasks.length = 0
    after.mockClear()
  })

  describe('once per order', () => {
    it('sends the confirmation to the buyer and the notification to the owner, once, when the browser and the webhook both settle it', async () => {
      const product = await publish({ title: 'Verveine' })
      const { id } = await paid(product)
      const { order } = await finalize.finalizePayment(payload, id) // the browser comes back
      expect(await webhook(succeededEvent(id))).toBe(200) // the webhook arrives
      expect(await webhook(succeededEvent(id))).toBe(200) // and is sent again
      await finalize.finalizePayment(payload, id) // a reload of the return page

      expect(toBuyer(order)).toHaveLength(1)
      expect(toOwner(order)).toHaveLength(1)
      expect(sentFor(order)).toHaveLength(2)
      expect(toBuyer(order)[0]!.replyTo).toBe(config.site.contactEmail)
      expect(toOwner(order)[0]!.replyTo).toBe('camille@example.com')
      const stored = await reload(order)
      expect(stored.confirmationEmailSentAt).toBeTruthy()
      expect(stored.needsAttention).toBe(false)
    })

    it('sends them once when the seam fires three times at once', async () => {
      const product = await publish({ title: 'Tilleul' })
      // An order the seam has not seen yet, as the plugin creates it.
      const order = await payload.create({
        collection: 'orders',
        overrideAccess: true,
        data: {
          items: [{ product: product.id, quantity: 1 }],
          linePrices: [{ product: String(product.id), quantity: 1, unitPrice: 790, lineTotal: 790 }],
          amount: 1280,
          subtotal: 790,
          shippingAmount: 490,
          currency: 'EUR',
          customerEmail: 'camille@example.com',
          status: 'processing',
          shippingAddress: address,
        } as Order,
      })
      await Promise.all([finalized.onOrderFinalized(payload, order), finalized.onOrderFinalized(payload, order), finalized.onOrderFinalized(payload, order)])
      expect(toBuyer(order)).toHaveLength(1)
      expect(toOwner(order)).toHaveLength(1)
    })

    it('sends them once when three confirmations race to settle a payment', async () => {
      const product = await publish({ title: 'Mélisse' })
      const { id } = await paid(product)
      const results = await Promise.allSettled([finalize.finalizePayment(payload, id), webhook(succeededEvent(id)), finalize.finalizePayment(payload, id)])
      expect(results.some((result) => result.status === 'fulfilled')).toBe(true)
      const { order } = await finalize.finalizePayment(payload, id)
      expect(toBuyer(order)).toHaveLength(1)
      expect(toOwner(order)).toHaveLength(1)
    })
  })

  describe('after the settlement, never inside it', () => {
    it('sends only once the payment is settled: the transaction succeeded, the cart is bought', async () => {
      const product = await publish({ title: 'Mauve' })
      const { id, cart } = await paid(product)
      const seen: { status: unknown; order: unknown; purchasedAt: unknown }[] = []
      onSend = async () => {
        const transaction = await payments.findPaymentTransaction(payload, id)
        const bought = await payload.db.findOne({ collection: 'carts', where: { id: { equals: cart.id } } })
        seen.push({ status: transaction?.status, order: transaction?.order, purchasedAt: (bought as Cart | null)?.purchasedAt })
      }
      expect(await webhook(succeededEvent(id))).toBe(200)
      expect(seen).toHaveLength(2)
      for (const moment of seen) {
        expect(moment.status).toBe('succeeded')
        expect(moment.order).toBeTruthy()
        expect(moment.purchasedAt).toBeTruthy()
      }
    })

    it('during a request, sends after the response (Next’s `after`): the settlement returns without waiting for the emails', async () => {
      after.mockImplementation((task) => void afterTasks.push(task))
      try {
        const product = await publish({ title: 'Menthe' })
        const { id } = await paid(product)
        // A transport that never answers: the settlement must not wait for it.
        onSend = () => new Promise(() => {})
        const { order } = await finalize.finalizePayment(payload, id)
        expect(order.id).toBeTruthy()
        expect(afterTasks).toHaveLength(1)
        expect(sentFor(order)).toHaveLength(0)
        expect((await reload(order)).confirmationEmailSentAt).toBeFalsy() // nothing claimed yet either

        onSend = async () => {}
        await afterTasks[0]!()
        expect(toBuyer(order)).toHaveLength(1)
        expect(toOwner(order)).toHaveLength(1)
      } finally {
        after.mockImplementation(outsideRequest)
      }
    })
  })

  describe('in the buyer’s language', () => {
    it('keeps the checkout’s language on the order, and writes to the buyer in it; the owner gets the default language', async () => {
      const product = await publish({ title: 'Sauge' })
      await payload.update({ collection: 'products', id: product.id, locale: 'en', data: { title: 'Sage' }, overrideAccess: true })
      const { id } = await paid(product, 'en')
      const { order } = await finalize.finalizePayment(payload, id)
      expect(order.locale).toBe('en')
      expect((await payments.findPaymentTransaction(payload, id))!.locale).toBe('en')

      const [buyer] = toBuyer(order)
      expect(buyer!.html).toContain('lang="en"')
      expect(buyer!.text).toContain(en.email.confirmation.intro)
      expect(buyer!.text).toContain('Sage') // the product's English name
      expect(buyer!.text).toContain(`/en/order/${order.id}?token=`)
      const [owner] = toOwner(order)
      expect(owner!.html).toContain(`lang="${config.locales.default}"`)
      expect(owner!.text).toContain({ fr, en }[config.locales.default].email.owner.intro.split('{')[0]!)
    })

    it('takes the language from the checkout’s Server Action', async () => {
      const product = await publish({ title: 'Romarin' })
      const items = [{ product: product.id, quantity: 1 }]
      const cart = await newCart(items)
      jar.set('lc_cart', `${cart.id}.${cart.secret}`)
      const { total } = await cartLoad.priceGuestCart(payload, { items })
      const details = { ...address, email: 'robin@example.com', phone: '' }
      expect((await actions.startPayment({ details, expectedTotal: total, locale: 'en' })).ok).toBe(true)
      const transaction = await payments.findPaymentTransaction(payload, stripe.last())
      expect(transaction!.locale).toBe('en')
    })

    it('falls back to the default language when the payment has none', async () => {
      const product = await publish({ title: 'Thym' })
      const { id } = await paid(product)
      const { order } = await finalize.finalizePayment(payload, id)
      expect(order.locale ?? null).toBeNull()
      expect(toBuyer(order)[0]!.html).toContain(`lang="${config.locales.default}"`)
    })
  })

  describe('when sending fails', () => {
    it('never fails the order: the webhook still answers 200, the order stands, and the owner is told it needs attention', async () => {
      const product = await publish({ title: 'Hysope' })
      const { id } = await paid(product)
      failFor = (message) => message.to === 'camille@example.com'
      expect(await webhook(succeededEvent(id))).toBe(200)

      const { order } = await finalize.finalizePayment(payload, id)
      expect(order.items).toHaveLength(1)
      expect(order.status).toBe('processing')
      const stored = await reload(order)
      expect(stored.needsAttention).toBe(true)
      expect(stored.attentionNote).toContain('camille@example.com')
      expect(stored.items).toHaveLength(1) // the flag leaves the rest of the order alone
      // The owner's notification went out, and says so.
      const [owner] = toOwner(order)
      expect(owner!.text).toContain(stored.attentionNote!)
    })

    it('keeps the claim: a later run does not send again (at most once), and the failure is on the order', async () => {
      const product = await publish({ title: 'Lavande' })
      const { id } = await paid(product)
      failFor = () => true
      const { order } = await finalize.finalizePayment(payload, id)
      expect(sentFor(order)).toHaveLength(0)
      const flagged = await reload(order)
      expect(flagged.confirmationEmailSentAt).toBeTruthy()
      expect(flagged.needsAttention).toBe(true)
      const notes = { fr, en }[config.locales.default].email.notes
      expect(flagged.attentionNote).toContain(notes.confirmationFailed.split('{')[0]!)
      expect(flagged.attentionNote).toContain(notes.notificationFailed)

      failFor = () => false
      await finalize.finalizePayment(payload, id)
      expect(await webhook(succeededEvent(id))).toBe(200)
      expect(sentFor(order)).toHaveLength(0)
    })

    it('keeps a note that was already there (stock ran out) and adds its own', async () => {
      const product = await publish({ title: 'Origan', inventory: 5 })
      const { id } = await paid(product) // 2 ordered
      await payload.db.updateOne({ collection: 'products', id: product.id, data: { inventory: 1 } }) // sold elsewhere meanwhile
      failFor = (message) => message.to === config.email.ownerNotificationsTo
      const { order } = await finalize.finalizePayment(payload, id)
      const stored = await reload(order)
      expect(stored.needsAttention).toBe(true)
      expect(stored.attentionNote).toContain('Origan')
      expect(stored.attentionNote).toContain({ fr, en }[config.locales.default].email.notes.notificationFailed)
      expect(toBuyer(order)).toHaveLength(1)
    })
  })
})
