import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'
import { cmsBlockComponents } from '@/modules/cms/blocks'
import { CmsPage, cmsPageMetadata } from '@/modules/cms/pages/route'
import { blockComponents as shopBlockComponents, ProductList } from '@/modules/shop/frontend'

// Home: the CMS page with slug `home`, or the shop's product list when the CMS is off.

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().modules.cms) return {}
  return cmsPageMetadata(locale, 'home')
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { modules } = getLightConfig()

  if (!modules.cms) return modules.shop ? <ProductList locale={locale} /> : notFound()

  const components = { ...cmsBlockComponents, ...(modules.shop ? shopBlockComponents : {}) }
  return <CmsPage locale={locale} slug="home" components={components} />
}
