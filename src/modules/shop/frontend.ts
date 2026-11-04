import config from '@payload-config'
import type { ComponentType } from 'react'
import { getPayload } from 'payload'

import { getLightConfig } from '@/config'
import type { SitemapEntry } from '@/core/types'

import { ProductGridBlock } from './blocks/ProductGrid/Component'
import { productSitemapEntries } from './products/sitemap'

// What the shop module gives the public site. The locale layout, the home page, CMS pages and
// src/app/sitemap.ts import these only when the shop is on. Stubs until the stories below fill them.

/** Cart link with the item count, for the header (S16). */
export { CartButton } from './components/CartButton'

/** Product list: the shop page, and the home page when the CMS is off (S15). */
export { ProductList } from './components/ProductList'

/** Components for the shop's blocks on CMS pages, keyed by block slug (S20: `productGrid`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block component has its own props
export const blockComponents: Record<string, ComponentType<any>> = { productGrid: ProductGridBlock }

/** Sitemap entries for the shop page and the published products, in every language (S15). */
export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  const { site, locales } = getLightConfig()
  return productSitemapEntries(await getPayload({ config }), site.url, locales.available)
}
