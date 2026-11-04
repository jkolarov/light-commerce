import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// "Payment received", after the checkout's return path. 404 when the shop is off.

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ locale: string }>
  searchParams?: Promise<{ checking?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) return {}
  const { paymentReceivedMetadata } = await import('@/modules/shop/checkout/route')
  return paymentReceivedMetadata(locale)
}

export default async function PaymentReceivedRoute({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) notFound()
  const { PaymentReceivedPage } = await import('@/modules/shop/checkout/route')
  return <PaymentReceivedPage locale={locale} checking={(await searchParams)?.checking === '1'} />
}
