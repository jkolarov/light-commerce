import type { I18nClient } from '@payloadcms/translations'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import type { Cart, Product, User } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { STRIPE_TEST_ENV } from '../support/stripe'

// What the owner sees of what needs them, in the admin's orders list: a badge on the orders that
// need attention (AttentionCell), and above the list the paid payments that could not become an
// order (FlaggedPayments, transactions with an `attentionNote`).

vi.mock('@payloadcms/plugin-ecommerce/payments/stripe', async (original) => (await import('../support/stripe')).fakeStripeAdapterModule(await original()))

const i18n = (language: 'fr' | 'en') => ({ language }) as I18nClient

describeWithShop('what needs attention, in the admin', () => {
  let test: TestPayload
  let payload: Payload
  let owner: User
  let cell: typeof import('@/modules/shop/admin/AttentionCell')
  let flagged: typeof import('@/modules/shop/admin/FlaggedPayments')

  beforeAll(async () => {
    test = await startPayload(STRIPE_TEST_ENV)
    payload = test.payload
    cell = await import('@/modules/shop/admin/AttentionCell')
    flagged = await import('@/modules/shop/admin/FlaggedPayments')
    owner = await payload.create({ collection: 'users', data: { email: 'owner@example.com', password: 'pw-owner-1', roles: ['owner'] }, overrideAccess: true })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('shows a badge on an order that needs attention, in the admin’s language, and nothing on the others', () => {
    expect(renderToStaticMarkup(<cell.AttentionCell cellData={true} i18n={i18n('fr')} />)).toContain('>À vérifier<')
    expect(renderToStaticMarkup(<cell.AttentionCell cellData={true} i18n={i18n('en')} />)).toContain('>Needs attention<')
    expect(renderToStaticMarkup(<cell.AttentionCell cellData={false} i18n={i18n('fr')} />)).toBe('')
    expect(renderToStaticMarkup(<cell.AttentionCell cellData={null} i18n={i18n('fr')} />)).toBe('')
  })

  it('lists the flagged payments above the orders, with a link to each, and nothing when there are none', async () => {
    const show = async (language: 'fr' | 'en') => renderToStaticMarkup(await flagged.FlaggedPayments({ payload, i18n: i18n(language), user: { ...owner, collection: 'users' } }))
    expect(await show('fr')).toBe('')

    const product = await payload.create({ collection: 'products', data: { title: 'Sarriette', priceInEUR: 700, inventory: 5, _status: 'published' } as Product, overrideAccess: true })
    const cart = await payload.create({ collection: 'carts', data: { items: [{ product: product.id, quantity: 1 }] } as Cart, overrideAccess: true })
    const transaction = await payload.db.create({
      collection: 'transactions',
      data: { status: 'pending', amount: 700, currency: 'EUR', cart: cart.id, stripe: { paymentIntentID: 'pi_flagged_1' }, attentionNote: 'Payé chez Stripe (pi_flagged_1), mais impossible à régler ici.' },
    })
    const html = await show('fr')
    expect(html).toContain('Un paiement à vérifier')
    expect(html).toContain('Paiement pi_flagged_1')
    expect(html).toContain('impossible à régler ici')
    expect(html).toContain(`href="/admin/collections/transactions/${transaction.id}"`)
    expect(await show('en')).toContain('One payment needs attention')
  })
})
