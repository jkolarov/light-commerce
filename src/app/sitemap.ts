import type { MetadataRoute } from 'next'

import { getLightConfig } from '@/config'

// Queries the database, which is empty (and has no tables) at build time: render per request.
export const dynamic = 'force-dynamic'

// Each module's entries are imported only when the module is on.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { modules } = getLightConfig()
  const entries: MetadataRoute.Sitemap = []
  if (modules.cms) entries.push(...(await (await import('@/modules/cms/frontend')).getSitemapEntries()))
  if (modules.shop) entries.push(...(await (await import('@/modules/shop/frontend')).getSitemapEntries()))
  return entries
}
