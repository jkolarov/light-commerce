import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// The shop's product list. 404 when the shop is off; the shop module is imported only when it is on.

// Products are read on each request, never at build time: the build runs against an empty database.
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) return {}
  const { shopMetadata } = await import('@/modules/shop/products/route')
  return shopMetadata(locale)
}

export default async function ShopPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) notFound()
  const { ProductList } = await import('@/modules/shop/frontend')
  return <ProductList locale={locale} />
}
