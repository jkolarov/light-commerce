import type { Field } from 'payload'

import { isLocale, type Locale } from '@/core/i18n/locales'

const nobody = () => false

/**
 * `locale`: the language the buyer checked out in, so the order's emails speak it. The Stripe
 * wrapper writes it on the transaction when the payment starts and copies it onto the order when
 * the order is created. Plain text, not a select: a value outside a select's options fails
 * validation, and nothing may throw during settlement. Read it with `buyerLocale`.
 */
export const buyerLocaleField = (): Field => ({
  name: 'locale',
  type: 'text',
  label: { en: 'Language', fr: 'Langue' },
  access: { update: nobody },
  admin: {
    readOnly: true,
    position: 'sidebar',
    description: { en: 'The language the buyer used at the checkout.', fr: 'La langue utilisée par l’acheteur au moment de commander.' },
  },
})

/** A stored `locale` if it is one the code knows, else `null` (an older document, or junk). */
export const buyerLocale = (value: unknown): Locale | null => (typeof value === 'string' && isLocale(value) ? value : null)
