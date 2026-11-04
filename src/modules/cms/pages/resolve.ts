import type { Payload, PayloadRequest } from 'payload'

import { isStaffOrOwner } from '@/core/access'
import { locales, type Locale } from '@/core/i18n/locales'
import type { Page } from '@/payload-types'

import { pagePath } from '../fields/link'

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

async function findBySlug({ payload, user }: Pick<LookupArgs, 'payload' | 'user'>, slug: string, slugLocale: Locale, readLocale: Locale) {
  const result = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    locale: slugLocale,
    // Fields are read in the page's language; a missing translation falls back to French (core config).
    limit: 1,
    depth: 1,
    draft: canSeeDrafts(user),
    user,
    overrideAccess: false,
  })
  const doc = result.docs[0]
  if (!doc) return null
  if (slugLocale === readLocale) return doc
  // Found by its slug in another language: read it again in this one (fallback applies). It is
  // not there when the page is not published in this language.
  const again = await payload.find({
    collection: 'pages',
    where: { id: { equals: doc.id } },
    locale: readLocale,
    limit: 1,
    depth: 1,
    draft: canSeeDrafts(user),
    user,
    overrideAccess: false,
  })
  return again.docs[0] ?? null
}

/**
 * Finds the page for `/<locale>/<slug>`. A slug that belongs to the page in another language
 * (`/en/a-propos`) answers with a redirect to this language's slug (`/en/about`), so the language
 * switch only has to swap the prefix. Unpublished pages are invisible to anonymous visitors.
 */
export async function lookupPage(args: LookupArgs): Promise<PageLookup> {
  const { locale, slug } = args
  const own = await findBySlug(args, slug, locale, locale)
  if (own) return { kind: 'page', page: own }

  for (const other of locales) {
    if (other === locale) continue
    const page = await findBySlug(args, slug, other, locale)
    if (!page) continue
    // No translated slug: the French one is the fallback, and it is this address.
    if (page.slug === slug) return { kind: 'page', page }
    return { kind: 'redirect', to: pagePath(page.slug ?? slug, locale) }
  }
  return { kind: 'notFound' }
}

/**
 * The page's slug in the languages it can be reached in, for `hreflang` alternates. French fills
 * a missing translated slug. Visitors only get the languages the page is published in, because
 * the others answer 404; staff get every language.
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
