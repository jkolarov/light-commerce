import type { Payload } from 'payload'

import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'

import type { Localized } from './schema'

// What every step of the seed shares: the Payload instance, what is switched on, the locales, the
// ids made so far (by file name and slug) and where to report.

export type SeedContext = {
  payload: Payload
  /** Which modules the running config has, read from its collections. */
  modules: { cms: boolean; shop: boolean; productGrid: boolean }
  /** The site's default locale first, then the others (light.config.ts). */
  locales: { default: Locale; others: Locale[] }
  /** Media ids by file name. */
  media: Map<string, number>
  /** Page ids and slugs, by French slug (the file name in content/pages/). */
  pages: Map<string, { id: number; slug: Localized }>
  /** Product ids by slug. */
  products: Map<string, number>
  /** Demo content left out because its module is off, one line each. */
  skipped: string[]
  log: (line: string) => void
}

/** Whether the pages' `layout` has a block, here the shop's `productGrid` (added only when both modules are on). */
function pagesHaveBlock(payload: Payload, slug: string): boolean {
  const layout = payload.collections.pages?.config.fields.find((field) => 'name' in field && field.name === 'layout')
  return layout?.type === 'blocks' && layout.blocks.some((block) => block.slug === slug)
}

export function createContext(payload: Payload, log: (line: string) => void): SeedContext {
  const { locales } = getLightConfig()
  const cms = Boolean(payload.collections.pages)
  const shop = Boolean(payload.collections.products)
  return {
    payload,
    modules: { cms, shop, productGrid: cms && shop && pagesHaveBlock(payload, 'productGrid') },
    locales: { default: locales.default, others: locales.available.filter((locale) => locale !== locales.default) },
    media: new Map(),
    pages: new Map(),
    products: new Map(),
    skipped: [],
    log,
  }
}

/** The text of a localized value in one locale; `undefined` when it has none (Payload then shows the default locale's). */
export function inLocale(value: Localized | undefined, locale: Locale): string | undefined {
  return value?.[locale]
}

/** Drops `undefined` values, so a locale with no text leaves the field alone. */
export function defined<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T
}

/** A media id, which `readDemo` has already checked exists. */
export function mediaId(ctx: SeedContext, file: string): number {
  const id = ctx.media.get(file)
  if (id === undefined) throw new Error(`The seed has no media document for ${file}.`)
  return id
}
