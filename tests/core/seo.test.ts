import { describe, expect, it } from 'vitest'

import { buildRobots, noindexHeaders } from '@/core/seo'

describe('robots and noindex', () => {
  it('disallows everything and sends noindex when not indexable', () => {
    const site = { url: 'https://demo.example.com', indexable: false }
    expect(buildRobots(site)).toEqual({ rules: { userAgent: '*', disallow: '/' } })
    expect(noindexHeaders(site)).toEqual([{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }])
  })

  it('allows all except admin and api, links the sitemap, and sends no header when indexable', () => {
    const site = { url: 'https://shop.example.com/', indexable: true }
    expect(buildRobots(site)).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
      sitemap: 'https://shop.example.com/sitemap.xml',
    })
    expect(noindexHeaders(site)).toEqual([])
  })
})
