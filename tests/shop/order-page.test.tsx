import type { Payload } from 'payload'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import type { Order, Product } from '@/payload-types'

import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { render } from '../theme/render'

// The order's confirmation page, `/[locale]/order/[id]?token=…` (Review focus #4): only with the
// order's own token; a wrong, missing or another order's token is the same 404 as no order.

const NOT_FOUND = { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }

// next-intl's server helpers need a request; read the real message files instead.
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'fr' | 'en'; namespace: 'order' }) => {
    const messages = { fr, en }[locale][namespace] as unknown as Record<string, string>
    return (key: string) => messages[key]
  },
}))

describeWithShop('order confirmation page', () => {
  let test: TestPayload
  let payload: Payload
  let load: typeof import('@/modules/shop/orders/load')
  let view: typeof import('@/modules/shop/orders/OrderView')
  let route: typeof import('@/app/(frontend)/[locale]/order/[id]/page')
  let orderRoute: typeof import('@/modules/shop/orders/route')
  let order: Order
  let other: Order

  const paid = (product: Product, quantity: number) =>
    payload.create({
      collection: 'orders',
      overrideAccess: true,
      data: {
        items: [{ product: product.id, quantity }],
        amount: quantity * 850 + 490,
        subtotal: quantity * 850,
        shippingAmount: 490,
        linePrices: [{ product: String(product.id), quantity, unitPrice: 850, lineTotal: quantity * 850 }],
        currency: 'EUR',
        customerEmail: 'camille@example.com',
        status: 'processing',
        shippingAddress: { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR', phone: '+33 6 12 34 56 78' },
      } as Order,
    })

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    load = await import('@/modules/shop/orders/load')
    view = await import('@/modules/shop/orders/OrderView')
    route = await import('@/app/(frontend)/[locale]/order/[id]/page')
    orderRoute = await import('@/modules/shop/orders/route')
    const tilleul = await payload.create({ collection: 'products', data: { title: 'Tilleul', slug: 'tilleul', priceInEUR: 850, _status: 'published' } as Product, overrideAccess: true })
    order = await paid(tilleul, 2)
    other = await paid(tilleul, 1)
    // Unpublished since: it still shows on the order that bought it.
    await payload.update({ collection: 'products', id: tilleul.id, data: { _status: 'draft' }, overrideAccess: true })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  /** The page as Next draws it: the route, then the shop's page component it returns. */
  const page = async (id: string | number, token?: unknown) => {
    await route.default({ params: Promise.resolve({ locale: 'fr', id: String(id) }), searchParams: Promise.resolve({ token: token as string }) })
    return orderRoute.OrderPage({ locale: 'fr', id: String(id), token })
  }

  it('answers 404 without the order’s own token', async () => {
    for (const token of [undefined, '', 'x', order.accessToken!.slice(0, -1), `${order.accessToken}x`, other.accessToken, ['a', 'b']]) {
      await expect(page(order.id, token), String(token)).rejects.toMatchObject(NOT_FOUND)
    }
    // No such order, or an id that is not one: the same answer.
    await expect(page(999999, order.accessToken)).rejects.toMatchObject(NOT_FOUND)
    await expect(page('12abc', order.accessToken)).rejects.toMatchObject(NOT_FOUND)
    await expect(page('-1', order.accessToken)).rejects.toMatchObject(NOT_FOUND)
  })

  it('shows the order to the holder of its token: thank you, number, details and what was paid', async () => {
    const shown = await load.loadOrderForGuest(payload, { id: String(order.id), token: order.accessToken, locale: 'fr' })
    expect(shown).toMatchObject({
      id: order.id,
      firstName: 'Camille',
      email: 'camille@example.com',
      phone: '+33 6 12 34 56 78',
      address: ['Camille Dupré', '12 rue des Claies', '26110 Nyons', 'France'],
      summary: { count: 2, subtotal: 1700, shipping: 490, total: 2190, lines: [{ title: 'Tilleul', quantity: 2, lineTotal: 1700 }] },
    })
    const html = render(<view.OrderView order={shown!} locale="fr" contactEmail="bonjour@lesclaies.example" />)
    for (const text of ['Merci, Camille !', `Commande n° ${order.id}`, '12 rue des Claies', '26110 Nyons', 'Tilleul', 'Quantité : 2', '17,00', '4,90', '21,90', 'TVA 5,5', 'Payée, en préparation', 'bonjour@lesclaies.example']) {
      expect(html, text).toContain(text)
    }
    // It never prints its own token.
    expect(html).not.toContain(order.accessToken)
  })

  it('is kept out of search engines, and keeps its address (with the token) from other sites', async () => {
    const metadata = await route.generateMetadata({ params: Promise.resolve({ locale: 'en', id: String(order.id) }) })
    expect(metadata).toMatchObject({ title: 'Order confirmation', robots: { index: false, follow: false }, referrer: 'same-origin' })
  })
})
