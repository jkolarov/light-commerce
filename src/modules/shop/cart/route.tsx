import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/core/i18n/locales'

import { CartPageView } from '../components/CartPageView'
import { currentCart } from './current'

// The cart page's route: `src/app/(frontend)/[locale]/cart/page.tsx` is a thin wrapper around
// these. It reads the visitor's cart from its cookie on each request.

/** The cart page: the visitor's lines and totals, or an empty cart. */
export async function CartPage({ locale }: { locale: Locale }) {
  return <CartPageView cart={await currentCart(locale)} locale={locale} />
}

/** "Your cart", kept out of search engines: every visitor's cart page is their own. */
export async function cartMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'cart' })
  return { title: t('title'), robots: { index: false, follow: true } }
}
