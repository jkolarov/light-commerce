import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { SitemapEntry } from '@/core/types'

import { productPath, shopPath } from './paths'

/**
 * The shop's sitemap entries: the product list in every language, and each published product in
 * every language it is published in (products are published in all of them at once), each with
 * `alternates.languages`. Drafts and the trash are left out: the read is a visitor's.
 */
export async function productSitemapEntries(payload: Payload, siteUrl: string, available: readonly Locale[]): Promise<SitemapEntry[]> {
  const base = siteUrl.replace(/\/$/, '')
  const shop = Object.fromEntries(available.map((locale) => [locale, `${base}${shopPath(locale)}`]))
  const entries: SitemapEntry[] = available.map((locale) => ({ url: `${base}${shopPath(locale)}`, alternates: { languages: { ...shop } } }))

  const { docs } = await payload.find({
    collection: 'products',
    locale: 'all',
    depth: 0,
    pagination: false,
    sort: 'createdAt',
    select: { slug: true, updatedAt: true, _status: true },
    draft: false,
    overrideAccess: false, // anonymous: the same products a visitor can open
  })
  for (const product of docs) {
    // With every language read at once, the status is one value per language.
    const status = product._status as unknown as Partial<Record<Locale, string>> | string | null | undefined
    const published = (locale: Locale) => (typeof status === 'string' ? status === 'published' : status?.[locale] === 'published')
    const urls = Object.fromEntries(available.filter(published).map((locale) => [locale, `${base}${productPath(locale, product.slug)}`]))
    const lastModified = product.updatedAt ? new Date(product.updatedAt) : undefined
    for (const url of Object.values(urls)) entries.push({ url, lastModified, alternates: { languages: { ...urls } } })
  }
  return entries
}
