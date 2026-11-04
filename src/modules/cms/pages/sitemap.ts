import type { Payload } from 'payload'

import { locales, type Locale } from '@/core/i18n/locales'
import type { SitemapEntry } from '@/core/types'

import { pagePath } from '../fields/link'

/**
 * One sitemap entry per published page and language, each with `alternates.languages` for every
 * language the page is published in. A language where the page is still a draft is left out.
 */
export async function pageSitemapEntries(payload: Payload, siteUrl: string, defaultLocale: Locale): Promise<SitemapEntry[]> {
  const base = siteUrl.replace(/\/$/, '')
  const { docs } = await payload.find({
    collection: 'pages',
    locale: 'all',
    depth: 0,
    pagination: false,
    draft: false,
    overrideAccess: false, // anonymous: the same pages a visitor can open
  })
  const entries: SitemapEntry[] = []
  for (const page of docs) {
    const slugs = page.slug as unknown as Partial<Record<Locale, string>> | null
    const status = page._status as unknown as Partial<Record<Locale, string>> | null | undefined
    if (!slugs) continue
    // A missing translated slug falls back to the default language's, like the page route.
    const fallback = slugs[defaultLocale] ?? Object.values(slugs).find(Boolean) ?? ''
    const urls: Partial<Record<Locale, string>> = {}
    for (const l of locales) {
      const published = status?.[l] === 'published'
      if (published) urls[l] = `${base}${pagePath(slugs[l] || fallback, l)}`
    }
    const lastModified = page.updatedAt ? new Date(page.updatedAt) : undefined
    for (const l of locales) {
      const url = urls[l]
      if (url) entries.push({ url, lastModified, alternates: { languages: { ...urls } } })
    }
  }
  return entries
}
