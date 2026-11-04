import type { ComponentType } from 'react'

import type { SitemapEntry } from '@/core/types'

// What the shop module gives the public site. The locale layout, the home page, CMS pages and
// src/app/sitemap.ts import these only when the shop is on. Stubs until the stories below fill them.

/** Cart link with the item count, for the header (S16). */
export { CartButton } from './components/CartButton'

/** Product list: the shop page, and the home page when the CMS is off (S15). */
export { ProductList } from './components/ProductList'

/** Components for the shop's blocks on CMS pages, keyed by block slug (S20 adds `productGrid`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block component has its own props
export const blockComponents: Record<string, ComponentType<any>> = {}

/** Sitemap entries for the products (S15). */
export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  return []
}
