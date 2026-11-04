import type { Payload } from 'payload'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { pageSitemapEntries } from '@/modules/cms/pages/sitemap'

import { describeWithCms } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

describeWithCms('sitemap entries', () => {
  let test: TestPayload
  let payload: Payload

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    const make = (title: string, extra: object = {}) =>
      payload.create({ collection: 'pages', data: { title, ...extra } as never, locale: 'fr', overrideAccess: true })
    // Published in FR and EN, with an EN slug.
    const about = await make('À propos', { slug: 'a-propos', _status: 'published' })
    await payload.update({ collection: 'pages', id: about.id, data: { title: 'About', slug: 'about', _status: 'published' }, locale: 'en', overrideAccess: true })
    // Published from FR, with FR text only: every language, the FR slug filling the gap.
    await make('Livraison', { _status: 'published' })
    // Published, then unpublished in EN ("Unpublish in English").
    const frOnly = await make('Seul FR', { _status: 'published' })
    await payload.update({ collection: 'pages', id: frOnly.id, data: { _status: 'draft' }, locale: 'en', overrideAccess: true })
    // Draft.
    await make('Secret', { _status: 'draft' })
    // Home page.
    await make('Accueil', { slug: 'home', _status: 'published' })
  }, 60_000)

  afterAll(async () => {
    await test.stop()
  })

  it('lists published pages only, per language, with alternates and absolute URLs', async () => {
    const entries = await pageSitemapEntries(payload, 'https://example.com/', 'fr')
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://example.com/fr/a-propos')
    expect(urls).toContain('https://example.com/en/about')
    expect(urls).toContain('https://example.com/fr/livraison')
    expect(urls).toContain('https://example.com/en/livraison')
    expect(urls).toContain('https://example.com/fr/seul-fr')
    expect(urls).not.toContain('https://example.com/en/seul-fr')
    expect(urls.some((u) => u.includes('secret'))).toBe(false)
    expect(urls).toContain('https://example.com/fr')
    const about = entries.find((e) => e.url === 'https://example.com/fr/a-propos')
    expect(about?.alternates?.languages).toEqual({ fr: 'https://example.com/fr/a-propos', en: 'https://example.com/en/about' })
  })
})
