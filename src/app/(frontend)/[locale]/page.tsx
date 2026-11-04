import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'
import { withSiteName } from '@/theme/title'

// Home: the CMS page with slug `home`, or the shop's product list when the CMS is off.
// A module's exports are imported only when the module is on.

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const { site, modules } = getLightConfig()
  if (!modules.cms) {
    // No CMS page to read a title from: the site name, and a line from the messages.
    const t = await getTranslations({ locale, namespace: 'home' })
    return { title: { absolute: site.name }, description: t('description'), openGraph: { title: site.name, description: t('description'), locale } }
  }
  const { cmsPageMetadata } = await import('@/modules/cms/pages/route')
  const meta = await cmsPageMetadata(locale, 'home')
  // The layout's title template does not reach this page (same segment): see withSiteName.
  const title = withSiteName(meta.title, site.name)
  return title ? { ...meta, title } : meta
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
