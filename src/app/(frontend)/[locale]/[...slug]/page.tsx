import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'
import { cmsBlockComponents } from '@/modules/cms/blocks'
import { CmsPage, cmsPageMetadata } from '@/modules/cms/pages/route'
import { blockComponents as shopBlockComponents } from '@/modules/shop/frontend'

// Any other address under /[locale]: a CMS page by its slug. Shop routes (shop/, cart/, ...) are
// more specific folders and win over this catch-all.

type Props = {
  params: Promise<{ locale: string; slug: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale) || !getLightConfig().modules.cms) return {}
  return cmsPageMetadata(locale, slug.map(decodeURIComponent).join('/'))
}

export default async function CmsCatchAllPage({ params }: Props) {
  const { locale, slug } = await params
  const { modules } = getLightConfig()
  if (!isLocale(locale) || !modules.cms) notFound()

  const components = { ...cmsBlockComponents, ...(modules.shop ? shopBlockComponents : {}) }
  return <CmsPage locale={locale} slug={slug.map(decodeURIComponent).join('/')} components={components} />
}
