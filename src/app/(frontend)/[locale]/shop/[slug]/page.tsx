import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// A product's page: /<locale>/shop/<slug>, one slug for every language. 404 when the shop is off,
// and for a product that is unknown or not published. The shop module is imported only when it is on.

// Products are read on each request, never at build time: the build runs against an empty database.
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) return {}
  const { productMetadata } = await import('@/modules/shop/products/route')
  return productMetadata(locale, slug)
}

export default async function ProductRoute({ params }: Props) {
  const { locale, slug } = await params
  if (!isLocale(locale) || !getLightConfig().modules.shop) notFound()
  const { ProductPage } = await import('@/modules/shop/products/route')
  return <ProductPage locale={locale} slug={slug} />
}
