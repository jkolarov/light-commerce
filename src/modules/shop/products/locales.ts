import type { Locale } from '@/core/i18n/locales'

/**
 * The languages a product is published in, from its `_status` read with `locale: 'all'` (one value
 * per language). Publishing always covers every language (core's `publishInEveryLocale`), but a
 * plain update that sets `_status: 'draft'` in one language unpublishes that one only, and its page
 * then answers 404 there.
 */
export function publishedLocales(status: unknown, available: readonly Locale[]): Locale[] {
  if (typeof status === 'string') return status === 'published' ? [...available] : []
  const byLocale = (status ?? {}) as Partial<Record<Locale, unknown>>
  return available.filter((locale) => byLocale[locale] === 'published')
}
