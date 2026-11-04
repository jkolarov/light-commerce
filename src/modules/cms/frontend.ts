import type { Locale } from '@/core/i18n/locales'
import type { NavItem, SitemapEntry } from '@/core/types'

// What the CMS module gives the public site. The locale layout, the home page and
// src/app/sitemap.ts import these only when the CMS is on. Stubs until the stories below fill them.

/** Header menu links for one locale (S11). */
export async function getHeaderNav(_locale: Locale): Promise<NavItem[]> {
  return []
}

/** Footer menu links for one locale (S11). */
export async function getFooterNav(_locale: Locale): Promise<NavItem[]> {
  return []
}

/** Sitemap entries for the published pages (S12). */
export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  return []
}
