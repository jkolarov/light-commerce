import config from '@payload-config'
import { getPayload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { NavItem, SitemapEntry } from '@/core/types'

import { readNav } from './globals/nav'

// What the CMS module gives the public site. The locale layout, the home page and
// src/app/sitemap.ts import these only when the CMS is on. Stubs until the stories below fill them.

/** Header menu links for one locale (S11). */
export async function getHeaderNav(locale: Locale): Promise<NavItem[]> {
  return readNav({ payload: await getPayload({ config }), global: 'header', locale })
}

/** Footer menu links for one locale (S11). */
export async function getFooterNav(locale: Locale): Promise<NavItem[]> {
  return readNav({ payload: await getPayload({ config }), global: 'footer', locale })
}

/** Footer short text for one locale, or `null` when there is none (S11). */
export async function getFooterText(locale: Locale): Promise<string | null> {
  const footer = await (await getPayload({ config })).findGlobal({ slug: 'footer', locale, depth: 0, overrideAccess: false })
  return footer.text?.trim() || null
}

/** Sitemap entries for the published pages (S12). */
export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  return []
}
