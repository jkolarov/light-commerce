import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// Home: the CMS page with slug `home`, or the shop's product list when the CMS is off.
// A module's exports are imported only when the module is on.

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.cms) return {}
  const { cmsPageMetadata } = await import('@/modules/cms/pages/route')
  return cmsPageMetadata(locale, 'home')
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { modules } = getLightConfig()

  if (!modules.cms) {
    if (!modules.shop) notFound()
    const { ProductList } = await import('@/modules/shop/frontend')
    return <ProductList locale={locale} />
  }

  const { CmsPage } = await import('@/modules/cms/pages/route')
  const { cmsBlockComponents } = await import('@/modules/cms/blocks/components')
  const shopComponents = modules.shop ? (await import('@/modules/shop/frontend')).blockComponents : {}
  return <CmsPage locale={locale} slug="home" components={{ ...cmsBlockComponents, ...shopComponents }} />
}
