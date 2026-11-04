import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { Product } from '@/payload-types'

import { publishedLocales } from './locales'

// What the shop's public pages read. Always as an anonymous visitor (`overrideAccess: false`, no
// user) and never drafts (`draft: false`): a product that is not published, or is in the trash, is
// simply not there, for staff too. The core's draft guard (`forcePublishedForPublic`) holds the
// same line for every other public read. Text is read in the page's language; a missing
// translation falls back to the default language (core localization).

/**
 * The published products, photos loaded, in the order they were added (the plugin's collection
 * has no sort of its own, and a small catalogue reads best in the order the owner built it). All
 * of them: a shop of a few products has no pages.
 */
export async function findPublishedProducts(payload: Payload, locale: Locale): Promise<Product[]> {
  const { docs } = await payload.find({
    collection: 'products',
    locale,
    depth: 1,
    sort: 'createdAt',
    pagination: false,
    draft: false,
    overrideAccess: false,
  })
  return docs
}

/** The published product with this slug, photos loaded, or `null`. One slug serves every language. */
export async function findPublishedProduct(payload: Payload, locale: Locale, slug: string): Promise<Product | null> {
  const { docs } = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    locale,
    depth: 1,
    limit: 1,
    pagination: false,
    draft: false,
    overrideAccess: false,
  })
  return docs[0] ?? null
}

/** The languages the product is published in, of those the site offers (for `hreflang`). */
export async function findPublishedLocales(payload: Payload, id: Product['id'], available: readonly Locale[]): Promise<Locale[]> {
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { equals: id } },
    locale: 'all',
    depth: 0,
    limit: 1,
    pagination: false,
    select: { _status: true },
    draft: false,
    overrideAccess: false,
  })
  return docs[0] ? publishedLocales(docs[0]._status, available) : []
}
