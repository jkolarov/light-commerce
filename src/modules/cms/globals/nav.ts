import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { NavItem } from '@/core/types'

import { resolveLinkHref, type LinkValue } from '../fields/link'

/**
 * The links of a menu global for one locale, read as the public (access rules apply, no drafts).
 * Links whose target is missing, unpublished or has no label are left out.
 */
export async function readNav(args: {
  payload: Payload
  global: 'header' | 'footer'
  locale: Locale
}): Promise<NavItem[]> {
  const { payload, global, locale } = args
  const menu = await payload.findGlobal({ slug: global, locale, depth: 1, draft: false, overrideAccess: false })
  const items = (menu.items ?? []) as { link?: LinkValue }[]
  const nav: NavItem[] = []
  for (const { link } of items) {
    const label = link?.label?.trim()
    const href = resolveLinkHref(link, locale)
    if (label && href) nav.push({ label, href })
  }
  return nav
}
