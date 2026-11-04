import type { MetadataRoute } from 'next'

import type { LightConfig } from '@/config'

type Site = Pick<LightConfig['site'], 'url' | 'indexable'>

export const NOINDEX_VALUE = 'noindex, nofollow'

/** `robots.txt` for the site: closed to everyone when it is not indexable, else open except the admin and API. */
export function buildRobots(site: Site): MetadataRoute.Robots {
  if (!site.indexable) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
    sitemap: `${site.url.replace(/\/$/, '')}/sitemap.xml`,
  }
}

/** Headers for every route (media included) when the site is not indexable; none otherwise. */
export function noindexHeaders(site: Pick<LightConfig['site'], 'indexable'>) {
  if (site.indexable) return []
  return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: NOINDEX_VALUE }] }]
}
