import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// The checkout. 404 when the shop is off; the shop module is imported only when it is on.

// The cart is read on each request, from the visitor's cookie.
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ locale: string }>
  searchParams?: Promise<{ payment?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) return {}
  const { checkoutMetadata } = await import('@/modules/shop/checkout/route')
  return checkoutMetadata(locale)
}

export default async function CheckoutRoute({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) notFound()
  const { CheckoutPage } = await import('@/modules/shop/checkout/route')
  return <CheckoutPage locale={locale} paymentFailed={(await searchParams)?.payment === 'failed'} />
}
