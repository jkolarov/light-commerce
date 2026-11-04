import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// The visitor's cart. 404 when the shop is off; the shop module is imported only when it is on.

// The cart is read on each request, from the visitor's cookie.
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) return {}
  const { cartMetadata } = await import('@/modules/shop/cart/route')
  return cartMetadata(locale)
}

export default async function CartRoute({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) notFound()
  const { CartPage } = await import('@/modules/shop/cart/route')
  return <CartPage locale={locale} />
}
