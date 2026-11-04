import type { Locale } from '@/core/i18n/locales'
import { localePath } from '@/core/i18n/path'

// The shop's public addresses. A product has one slug for every language (plan, "Collections,
// blocks, routes"), so its page is the same path under each locale prefix.

/** The product list: `/fr/shop`. */
export const shopPath = (locale: Locale) => localePath(locale, '/shop')

/** A product's page: `/fr/shop/tilleul`. */
export const productPath = (locale: Locale, slug: string) => localePath(locale, `/shop/${slug}`)
