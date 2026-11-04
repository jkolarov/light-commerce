import { expect, it } from 'vitest'

import { getLightConfig } from '@/config'
import { formatMoney } from '@/modules/shop/money'
import { renderOrderConfirmation } from '@/modules/shop/emails/orderConfirmation'
import { renderOwnerNotification } from '@/modules/shop/emails/ownerNotification'
import type { Order, Product } from '@/payload-types'

import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

import { describeWithShop } from '../support/modules'

// The order emails as they are rendered (S19): what the buyer and the owner read, in which
// language, in HTML and plain text, and that nothing the buyer typed can turn into HTML.

const { site, locales } = getLightConfig()
const TOKEN = 'Tk_0123456789abcdefghijklmnopqrstuvwxyzABCDE'

/** A paid order as the sender hands it over: lines priced, products read in the email's language. */
function paidOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1042,
    createdAt: '2026-11-04T10:15:00.000Z',
    updatedAt: '2026-11-04T10:15:00.000Z',
    items: [
      { id: 'line-1', product: { id: 7, title: 'Verveine' } as Product, quantity: 2 },
      // Deleted for good since: the line lost its product.
      { id: 'line-2', product: null, quantity: 1 },
    ],
    linePrices: [
      { product: '7', quantity: 2, unitPrice: 790, lineTotal: 1580 },
      { product: '9', quantity: 1, unitPrice: 850, lineTotal: 850 },
    ],
    subtotal: 2430,
    shippingAmount: 490,
    amount: 2920,
    currency: 'EUR',
    customerEmail: 'camille@example.com',
    status: 'processing',
    shippingAddress: { firstName: 'Camille', lastName: 'Dupré', addressLine1: '12 rue des Claies', postalCode: '26110', city: 'Nyons', country: 'FR', phone: '+33 6 12 34 56 78' },
    accessToken: TOKEN,
    locale: 'en',
    needsAttention: false,
    ...overrides,
  } as Order
}

const money = (cents: number, locale: 'fr' | 'en') => formatMoney(cents, { currency: 'EUR', locale })

describeWithShop('order emails: what they say', () => {
  it.each([
    ['en', en],
    ['fr', fr],
  ] as const)('confirms the order to the buyer in %s, with everything they need', (locale, messages) => {
    const email = renderOrderConfirmation(paidOrder(), locale)
    const url = `${new URL(`/${locale}/order/1042?token=${TOKEN}`, site.url)}`

    expect(email.subject).toContain('1042')
    expect(email.subject).not.toMatch(/1[\s.,  ]042/) // no digit grouping in an order number
    for (const part of [email.html, email.text]) {
      expect(part).toContain('1042')
      expect(part).toContain('Verveine')
      expect(part).toContain(messages.email.unavailableName) // the deleted product's line
      expect(part).toContain(money(1580, locale))
      expect(part).toContain(money(850, locale))
      expect(part).toContain(money(2430, locale))
      expect(part).toContain(money(490, locale))
      expect(part).toContain(money(2920, locale))
      expect(part).toContain(locale === 'fr' ? '5,5' : '5.5') // the tax rate, per locale
      expect(part).toContain('12 rue des Claies')
      expect(part).toContain('26110 Nyons')
      expect(part).toContain('France')
      expect(part).toContain(site.contactEmail)
      expect(part).toContain(messages.email.confirmation.intro)
    }
    // The link to the order page, absolute, with its token (`&` written as `&amp;` in HTML only).
    expect(email.text).toContain(url)
    expect(email.html).toContain(`href="${url.replaceAll('&', '&amp;')}"`)
    expect(email.html).toContain(`lang="${locale}"`)
    expect(email.html).toContain(messages.email.confirmation.greeting.replace('{name}', 'Camille'))
  })

  it('tells the owner in the default language, with a link to the admin and never the buyer’s link', () => {
    const owner = renderOwnerNotification(paidOrder())
    const messages = { fr, en }[locales.default]
    expect(owner.html).toContain(`lang="${locales.default}"`)
    expect(owner.subject).toContain('1042')
    expect(owner.subject).toContain(money(2920, locales.default))
    const admin = `${new URL('/admin/collections/orders/1042', site.url)}`
    for (const part of [owner.html, owner.text]) {
      expect(part).toContain(admin)
      expect(part).toContain('camille@example.com')
      expect(part).toContain('+33 6 12 34 56 78')
      expect(part).toContain('Camille Dupré')
      expect(part).toContain('Verveine')
      expect(part).toContain(money(2920, locales.default))
      // The buyer's language, named in the owner's.
      expect(part).toContain(new Intl.DisplayNames([locales.default], { type: 'language' }).of('en')!)
      // The order page link is the buyer's key: never in the owner's email.
      expect(part).not.toContain(TOKEN)
      expect(part).not.toContain('/order/')
      expect(part).not.toContain(messages.email.owner.attention)
    }
  })

  it('says so when the order needs attention, with the note', () => {
    const note = 'Stock insuffisant à la confirmation du paiement : 2 × Verveine commandés, 1 en stock.'
    const owner = renderOwnerNotification(paidOrder({ needsAttention: true, attentionNote: note }))
    const messages = { fr, en }[locales.default]
    // The subject starts with the warning, before any number.
    expect(owner.subject.startsWith(messages.email.owner.subjectAttention.split('{')[0]!)).toBe(true)
    for (const part of [owner.html, owner.text]) {
      expect(part).toContain(messages.email.owner.attention)
      expect(part).toContain(note)
    }
  })

  it('escapes everything the buyer typed, and product names, in the HTML', () => {
    const order = paidOrder({
      customerEmail: 'x@example.com',
      shippingAddress: {
        firstName: '<script>alert("name")</script>',
        lastName: '"><img src=x onerror=alert(1)>',
        addressLine1: '12 rue <b>des</b> Claies & fils',
        addressLine2: "<a href='javascript:alert(2)'>bât. B</a>",
        postalCode: '26110',
        city: '<iframe src=//evil.example>',
        country: 'FR',
        phone: '<svg onload=alert(3)>',
      },
      items: [{ id: 'line-1', product: { id: 7, title: 'Verveine <em>bio</em>' } as Product, quantity: 2 }],
      needsAttention: true,
      attentionNote: '<img src=x onerror=alert(4)>',
    })
    const emails = [renderOrderConfirmation(order, 'fr'), renderOrderConfirmation(order, 'en'), renderOwnerNotification(order)]
    for (const { html, text, subject } of emails) {
      for (const tag of ['<script', '<img', '<b>', '<a href=\'javascript', '<iframe', '<svg', '<em>']) expect(html).not.toContain(tag)
      expect(html).toContain('&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;')
      expect(html).toContain('Claies &amp; fils')
      expect(html).toContain('Verveine &lt;em&gt;bio&lt;/em&gt;')
      // The plain-text part is text: shown as typed, never interpreted.
      expect(text).toContain('Verveine <em>bio</em>')
      // Nothing the buyer typed goes in a header.
      expect(subject).not.toMatch(/[<>\r\n]/)
    }
  })

  it('is plain, email-safe HTML: tables, inline styles in the theme’s colours, no CSS or script to load', () => {
    const { colors } = getLightConfig().theme
    for (const { html, text } of [renderOrderConfirmation(paidOrder(), 'fr'), renderOwnerNotification(paidOrder())]) {
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
      expect(html).toContain('<table')
      expect(html).not.toMatch(/<(script|style|link)\b/i)
      expect(html).not.toMatch(/\bclass=/)
      expect(html).toContain(colors.primary)
      expect(html).toContain(colors.text)
      expect(text).not.toMatch(/<[a-z]/i)
      expect(text.length).toBeGreaterThan(100)
    }
  })

  it('shows lines without prices when the order has no line prices', () => {
    const email = renderOrderConfirmation(paidOrder({ linePrices: null }), 'en')
    expect(email.text).toContain('Verveine')
    expect(email.text).toContain(money(2920, 'en'))
  })
})
