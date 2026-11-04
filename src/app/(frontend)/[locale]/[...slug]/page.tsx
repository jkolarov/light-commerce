import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// Any other address under /[locale]: a CMS page by its slug. Shop routes (shop/, cart/, ...) are
// more specific folders and win over this catch-all. A module's exports are imported only when
// the module is on.
//
// Slugs are lowercase ASCII (the collection slugifies them), so the params are used as they come:
// an encoded or odd segment simply matches no page and answers 404.

type Props = {
  params: Promise<{ locale: string; slug: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale) || !getLightConfig().modules.cms) return {}
  const { cmsPageMetadata } = await import('@/modules/cms/pages/route')
  return cmsPageMetadata(locale, slug.join('/'))
}

export default async function CmsCatchAllPage({ params }: Props) {
  const { locale, slug } = await params
  const { modules } = getLightConfig()
  if (!isLocale(locale) || !modules.cms) notFound()

  const path = slug.join('/')
  // The home page lives at /<locale>, not /<locale>/home.
  if (path === 'home') redirect(`/${locale}`)

  const { CmsPage } = await import('@/modules/cms/pages/route')
  const { cmsBlockComponents } = await import('@/modules/cms/blocks/components')
  const shopComponents = modules.shop ? (await import('@/modules/shop/frontend')).blockComponents : {}
  return <CmsPage locale={locale} slug={path} components={{ ...cmsBlockComponents, ...shopComponents }} />
}
