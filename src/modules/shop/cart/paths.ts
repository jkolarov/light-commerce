import type { Locale } from '@/core/i18n/locales'
import { localePath } from '@/core/i18n/path'

/** The cart page: `/fr/cart`. */
export const cartPath = (locale: Locale) => localePath(locale, '/cart')

/** The checkout (S17): `/fr/checkout`. */
export const checkoutPath = (locale: Locale) => localePath(locale, '/checkout')
