import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@/config')
})

type Opts = { indexable?: boolean; available?: string[]; default?: string }

async function run(path: string, opts: Opts = {}) {
  vi.doMock('@/config', () => ({
    getLightConfig: () => ({
      site: { url: 'https://x.test', indexable: opts.indexable ?? true },
      locales: { available: opts.available ?? ['fr', 'en'], default: opts.default ?? 'fr' },
    }),
  }))
  const { proxy } = await import('@/proxy')
  return proxy(new NextRequest(`http://localhost:3000${path}`))
}

describe('proxy noindex', () => {
  for (const path of ['/', '/admin', '/api/x']) {
    it(`sets X-Robots-Tag on ${path} when not indexable`, async () => {
      expect((await run(path, { indexable: false })).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    })
    it(`sets nothing on ${path} when indexable`, async () => {
      expect((await run(path)).headers.get('x-robots-tag')).toBeNull()
    })
  }
})

describe('proxy locale routing', () => {
  it('redirects / to the default locale, keeping the query', async () => {
    const res = await run('/?utm=1', { default: 'en' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/en?utm=1')
  })

  it('keeps noindex on the redirect', async () => {
    const res = await run('/', { indexable: false })
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  const untouched = [
    '/admin',
    '/admin/collections/pages',
    '/api/pages',
    '/api/media/file/a.jpg',
    '/healthz',
    '/_next/image',
    '/robots.txt',
    '/sitemap.xml',
    '/favicon.ico',
    '/logo.svg',
    '/images/hero.png',
  ]
  for (const path of untouched) {
    it(`leaves ${path} alone`, async () => {
      const res = await run(path)
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-next-intl-locale')).toBeNull()
    })
  }

  for (const path of ['/fr', '/fr/', '/en/about', '/en/shop/a-b']) {
    it(`passes ${path} on with its locale`, async () => {
      const res = await run(path)
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-next-intl-locale')).toBe(path.slice(1, 3))
    })
  }

  // No redirect and no rewrite: the page route calls notFound(), so the answer is a 404.
  for (const path of ['/de', '/de/about', '/about', '/FR']) {
    it(`gives ${path} no locale, so the page route answers 404`, async () => {
      const res = await run(path)
      expect(res.headers.get('location')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-next-intl-locale')).toBeNull()
    })
  }

  it('treats a locale the site does not use as unknown', async () => {
    const res = await run('/en/about', { available: ['fr'], default: 'fr' })
    expect(res.headers.get('x-middleware-request-x-next-intl-locale')).toBeNull()
  })

  it('does not trust a locale header sent by the client', async () => {
    vi.doMock('@/config', () => ({
      getLightConfig: () => ({
        site: { url: 'https://x.test', indexable: true },
        locales: { available: ['fr', 'en'], default: 'fr' },
      }),
    }))
    const { proxy } = await import('@/proxy')
    const res = proxy(
      new NextRequest('http://localhost:3000/de', { headers: { 'x-next-intl-locale': 'en' } }),
    )
    expect(res.headers.get('x-middleware-request-x-next-intl-locale')).toBeNull()
  })
})
