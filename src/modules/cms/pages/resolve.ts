import type { Payload, PayloadRequest, Where } from 'payload'

import { isStaffOrOwner } from '@/core/access'
import { locales, type Locale } from '@/core/i18n/locales'
import type { Page } from '@/payload-types'

import { pagePath } from '../fields/link'
import { HOME_SLUG } from '../fields/slugs'

export type PageLookup =
  | { kind: 'page'; page: Page }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' }

type LookupArgs = {
  payload: Payload
  locale: Locale
  slug: string
  /** The logged-in user, if any. Staff and owners also get drafts; everyone else only published pages. */
  user?: PayloadRequest['user']
}

export function canSeeDrafts(user: PayloadRequest['user'] | undefined): boolean {
  return isStaffOrOwner({ req: { user: user ?? null } as PayloadRequest })
}

/**
 * The page matching `where`, as this visitor may see it. Fields are read in `locale`; a missing
 * translation falls back to French (core config).
 */
async function findPage({ payload, user }: Pick<LookupArgs, 'payload' | 'user'>, where: Where, locale: Locale) {
  const result = await payload.find({
    collection: 'pages',
    where,
    locale,
    limit: 1,
    depth: 1,
    draft: canSeeDrafts(user),
    user,
    overrideAccess: false,
  })
  return result.docs[0] ?? null
}

/**
 * Finds the page for `/<locale>/<slug>`. A slug that belongs to the page in another language
 * (`/en/a-propos`) answers with a redirect to this language's slug (`/en/about`), so the language
 * switch only has to swap the prefix. Unpublished pages are invisible to anonymous visitors.
 *
 * A page is published in every language at once (`publishInEveryLocale`), but "Unpublish in
 * English" can still take it down in one language. Its address in another language, where the
 * language switch leads, then redirects to this language's home page instead of a 404. Its own
 * English address is a 404, and so is the home page itself.
 */
export async function lookupPage(args: LookupArgs): Promise<PageLookup> {
  const { locale, slug } = args
  const own = await findPage(args, { slug: { equals: slug } }, locale)
  if (own) return { kind: 'page', page: own }

  for (const other of locales) {
    if (other === locale) continue
    const there = await findPage(args, { slug: { equals: slug } }, other)
    if (!there) continue
    // Found by its slug in another language: read it again in this one (fallback applies).
    const page = await findPage(args, { id: { equals: there.id } }, locale)
    if (!page) return slug === HOME_SLUG ? { kind: 'notFound' } : { kind: 'redirect', to: pagePath(HOME_SLUG, locale) }
    // No translated slug: the French one is the fallback, and it is this address.
    if (page.slug === slug) return { kind: 'page', page }
    return { kind: 'redirect', to: pagePath(page.slug ?? slug, locale) }
  }
  return { kind: 'notFound' }
}

/**
 * The page's slug in the languages it can be reached in, for `hreflang` alternates. French fills
 * a missing translated slug. Visitors only get the languages the page is published in (every
 * language, unless it was unpublished in one); staff get every language.
 */
export async function pageSlugs(args: Pick<LookupArgs, 'payload' | 'user'> & { id: Page['id'] }) {
  const all = await args.payload.findByID({
    collection: 'pages',
    id: args.id,
    locale: 'all',
    depth: 0,
    draft: canSeeDrafts(args.user),
    user: args.user,
    overrideAccess: false,
  })
  const slugs = all.slug as unknown as Partial<Record<Locale, string>>
  const status = all._status as unknown as Partial<Record<Locale, string>> | string
  const fallback = slugs.fr ?? Object.values(slugs).find(Boolean) ?? ''
  const staff = canSeeDrafts(args.user)
  const result: Partial<Record<Locale, string>> = {}
  for (const l of locales) {
    const published = typeof status === 'string' ? status === 'published' : status?.[l] === 'published'
    if (staff || published) result[l] = slugs[l] || fallback
  }
  return result
}
