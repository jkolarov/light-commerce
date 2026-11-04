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

/** `X-Robots-Tag` for every response when the site is not indexable; none otherwise. */
export function noindexHeaders(site: Pick<LightConfig['site'], 'indexable'>): Record<string, string> {
  return site.indexable ? {} : { 'X-Robots-Tag': NOINDEX_VALUE }
}

/** Sets the noindex header on a response (the proxy calls this). */
export function applyNoindex(response: Response, site: Pick<LightConfig['site'], 'indexable'>): Response {
  for (const [key, value] of Object.entries(noindexHeaders(site))) response.headers.set(key, value)
  return response
}
