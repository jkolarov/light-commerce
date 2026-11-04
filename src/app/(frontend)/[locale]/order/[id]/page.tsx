import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// An order's confirmation page, with its access token (`?token=`). 404 when the shop is off; the
// shop module is imported only when it is on.

// Each visitor's own order, read on each request, never cached.
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ locale: string; id: string }>
  searchParams?: Promise<{ token?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) return {}
  const { orderMetadata } = await import('@/modules/shop/orders/route')
  return orderMetadata(locale)
}

export default async function OrderRoute({ params, searchParams }: Props) {
  const { locale, id } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) notFound()
  const { OrderPage } = await import('@/modules/shop/orders/route')
  return <OrderPage locale={locale} id={id} token={(await searchParams)?.token} />
}
