import { handleEndpoints, type Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { cmsBlockComponents } from '@/modules/cms/blocks/components'
import { isValidLinkUrl, resolveLinkHref } from '@/modules/cms/fields/link'
import { lookupPage, pageSlugs } from '@/modules/cms/pages/resolve'
import type { Page, User } from '@/payload-types'
import { switchLocalePath } from '@/theme/language'

import { describeWithCms } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { paragraph, richText, text } from './blocks.fixtures'

// The page route reads the visitor from the request headers: an anonymous visitor here.
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

describeWithCms('pages', () => {
  let test: TestPayload
  let payload: Payload
  let staff: User
  let aboutId: number
  let draftId: number

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@example.com', password: 'pw-staff-1', roles: ['staff'] },
      overrideAccess: true,
    })
    // Published, with a slug in each language.
    const about = await payload.create({
      collection: 'pages',
      data: { title: 'À propos', slug: 'a-propos', _status: 'published' },
      locale: 'fr',
      overrideAccess: true,
    })
    aboutId = about.id
    await payload.update({
      collection: 'pages',
      id: aboutId,
      data: { title: 'About', slug: 'about', _status: 'published' },
      locale: 'en',
      overrideAccess: true,
    })
    // Published in every language, with text in French only: no EN title and no EN slug.
    const shipping = await payload.create({
      collection: 'pages',
      data: { title: 'Livraison', _status: 'published' },
      locale: 'fr',
      overrideAccess: true,
    })
    await payload.update({
      collection: 'pages',
      id: shipping.id,
      data: { _status: 'published' },
      publishAllLocales: true,
      locale: 'fr',
      overrideAccess: true,
    })
    const draft = await payload.create({
      collection: 'pages',
      data: { title: 'Secret', _status: 'draft' },
      locale: 'fr',
      overrideAccess: true,
    })
    draftId = draft.id
  }, 60_000)

  afterAll(async () => {
    await test.stop()
  })

  it('makes the slug from the title', async () => {
    const { docs } = await payload.find({ collection: 'pages', where: { id: { equals: draftId } }, draft: true, overrideAccess: true })
    expect(docs[0]!.slug).toBe('secret')
  })

  it('refuses the same slug twice in one language, and the shop slugs', async () => {
    await expect(
      payload.create({ collection: 'pages', data: { title: 'About again', slug: 'a-propos', _status: 'published' }, locale: 'fr', overrideAccess: true }),
    ).rejects.toThrow(/Slug|unique|already/i)
    await expect(
      payload.create({ collection: 'pages', data: { title: 'Shop', _status: 'published' }, locale: 'fr', overrideAccess: true }),
    ).rejects.toThrow(/Slug/)
  })

  it('hides an unpublished page from anonymous visitors, shows it to staff', async () => {
    const anonymous = await lookupPage({ payload, locale: 'fr', slug: 'secret' })
    expect(anonymous.kind).toBe('notFound')
    const asStaff = await lookupPage({ payload, locale: 'fr', slug: 'secret', user: { ...staff, collection: 'users' } })
    expect(asStaff.kind).toBe('page')
    const list = await payload.find({ collection: 'pages', overrideAccess: false })
    expect(list.docs.map((d) => d.slug)).not.toContain('secret')
  })

  it('shows the French text when the English one is missing', async () => {
    const result = await lookupPage({ payload, locale: 'en', slug: 'livraison' })
    expect(result.kind).toBe('page')
    if (result.kind === 'page') expect(result.page.title).toBe('Livraison')
  })

  it('serves a translated page by its own slug', async () => {
    const result = await lookupPage({ payload, locale: 'en', slug: 'about' })
    expect(result.kind === 'page' && result.page.title).toBe('About')
  })

  it("redirects the other language's slug to this language's slug", async () => {
    expect(await lookupPage({ payload, locale: 'en', slug: 'a-propos' })).toEqual({ kind: 'redirect', to: '/en/about' })
    expect(await lookupPage({ payload, locale: 'fr', slug: 'about' })).toEqual({ kind: 'redirect', to: '/fr/a-propos' })
  })

  it('publishes in every language at once, from a create or a one-language Publish, French filling the gaps', async () => {
    const asStaff = { ...staff, collection: 'users' as const }
    await payload.create({ collection: 'pages', data: { title: 'Bientôt', _status: 'published' }, locale: 'fr', overrideAccess: false, user: asStaff })
    const draft = await payload.create({
      collection: 'pages', data: { title: 'Ensuite', _status: 'draft' }, draft: true, locale: 'fr', overrideAccess: false, user: asStaff,
    })
    expect((await lookupPage({ payload, locale: 'en', slug: 'ensuite' })).kind).toBe('notFound')
    // The admin's Publish button ("Publier en Français") saves the language on screen.
    await payload.update({ collection: 'pages', id: draft.id, data: { _status: 'published' }, locale: 'fr', overrideAccess: false, user: asStaff })
    for (const [slug, title] of [['bientot', 'Bientôt'], ['ensuite', 'Ensuite']]) {
      const en = await lookupPage({ payload, locale: 'en', slug: slug! })
      expect(en.kind === 'page' && en.page.title, slug).toBe(title)
    }
  })

  it('publishes in every language from the REST API too, the way the admin does', async () => {
    const draft = await payload.create({ collection: 'pages', data: { title: 'Par l’API', _status: 'draft' }, draft: true, locale: 'fr', overrideAccess: true })
    const { token } = await payload.login({ collection: 'users', data: { email: 'staff@example.com', password: 'pw-staff-1' } })
    const url = `http://localhost/api/pages/${draft.id}?locale=fr&depth=0`
    const res = await handleEndpoints({
      config: payload.config,
      path: `/api/pages/${draft.id}`,
      request: new Request(url, {
        method: 'PATCH',
        headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ _status: 'published' }),
      }),
    })
    expect(res.status).toBe(200)
    const en = await lookupPage({ payload, locale: 'en', slug: 'par-l-api' })
    expect(en.kind === 'page' && en.page.title).toBe('Par l’API')
  })

  it('answers in English with the French text, for a page published in French only', async () => {
    await payload.create({
      collection: 'pages',
      data: { title: 'Nouveautés', _status: 'published', layout: [{ blockType: 'richText', content: richText(paragraph(text('Les tisanes de la saison.'))) }] as Page['layout'] },
      locale: 'fr',
      overrideAccess: true,
    })
    const { CmsPage } = await import('@/modules/cms/pages/route')
    // `notFound()` would throw here; a rendered page is a 200.
    const html = renderToStaticMarkup(await CmsPage({ locale: 'en', slug: 'nouveautes', components: cmsBlockComponents }))
    expect(html).toContain('Les tisanes de la saison.')
  })

  it('keeps a page out of one language after "Unpublish in English", until the next publish', async () => {
    const page = await payload.create({ collection: 'pages', data: { title: 'Saison', _status: 'published' }, locale: 'fr', overrideAccess: true })
    // What the admin's "Unpublish in English" sends: `_status: 'draft'` for that language only.
    await payload.update({ collection: 'pages', id: page.id, data: { _status: 'draft' }, locale: 'en', overrideAccess: true })
    expect((await lookupPage({ payload, locale: 'fr', slug: 'saison' })).kind).toBe('page')
    // The French address in English, where the language switch leads, goes to the English home page.
    expect(await lookupPage({ payload, locale: 'en', slug: 'saison' })).toEqual({ kind: 'redirect', to: '/en' })
    // Publishing again, in any language, publishes it everywhere.
    await payload.update({ collection: 'pages', id: page.id, data: { _status: 'published' }, locale: 'fr', overrideAccess: true })
    expect((await lookupPage({ payload, locale: 'en', slug: 'saison' })).kind).toBe('page')
  })

  it('sends the other language of a page unpublished there to its home page, never to a 404', async () => {
    const page = await payload.create({ collection: 'pages', data: { title: 'Atelier', slug: 'atelier', _status: 'published' }, locale: 'fr', overrideAccess: true })
    await payload.update({ collection: 'pages', id: page.id, data: { title: 'Workshop', slug: 'workshop', _status: 'published' }, locale: 'en', overrideAccess: true })
    await payload.update({ collection: 'pages', id: page.id, data: { _status: 'draft' }, locale: 'en', overrideAccess: true })
    // The language switch on /fr/atelier links to /en/atelier, which leads to the English home page.
    expect(switchLocalePath('/fr/atelier', 'en')).toBe('/en/atelier')
    expect(await lookupPage({ payload, locale: 'en', slug: 'atelier' })).toEqual({ kind: 'redirect', to: '/en' })
    // The page's own English address is offline.
    expect((await lookupPage({ payload, locale: 'en', slug: 'workshop' })).kind).toBe('notFound')
    // Staff still preview it.
    const forStaff = await lookupPage({ payload, locale: 'en', slug: 'workshop', user: { ...staff, collection: 'users' } })
    expect(forStaff.kind === 'page' && forStaff.page.title).toBe('Workshop')
  })

  it('keeps draft text and versions from anonymous callers', async () => {
    // Published in every language with French text, then a newer French draft over it.
    const created = await payload.create({ collection: 'pages', data: { title: 'Public title', _status: 'published' }, locale: 'fr', overrideAccess: true })
    await payload.update({ collection: 'pages', id: created.id, data: { _status: 'published' }, publishAllLocales: true, locale: 'fr', overrideAccess: true })
    await payload.update({ collection: 'pages', id: created.id, data: { title: 'DRAFT TITLE', _status: 'draft' }, draft: true, locale: 'fr', overrideAccess: true })

    for (const locale of ['en', 'fr', 'all'] as const) {
      const anonymous = await payload.find({ collection: 'pages', where: { id: { equals: created.id } }, draft: true, locale, overrideAccess: false })
      expect(JSON.stringify(anonymous.docs)).not.toContain('DRAFT TITLE')
      expect(anonymous.docs).toHaveLength(1)
    }
    const byId = await payload.findByID({ collection: 'pages', id: created.id, draft: true, locale: 'en', overrideAccess: false })
    expect(JSON.stringify(byId)).not.toContain('DRAFT TITLE')
    await expect(payload.findVersions({ collection: 'pages', overrideAccess: false })).rejects.toThrow()

    const asStaff = await payload.find({
      collection: 'pages', where: { id: { equals: created.id } }, draft: true, locale: 'fr', overrideAccess: false, user: { ...staff, collection: 'users' },
    })
    expect(asStaff.docs[0]!.title).toBe('DRAFT TITLE')
    const versions = await payload.findVersions({ collection: 'pages', overrideAccess: false, user: { ...staff, collection: 'users' } })
    expect(versions.totalDocs).toBeGreaterThan(0)
  })

  it('lists in hreflang only the languages where the page is published', async () => {
    const created = await payload.create({ collection: 'pages', data: { title: 'Seul FR', _status: 'published' }, locale: 'fr', overrideAccess: true })
    expect(await pageSlugs({ payload, id: created.id })).toEqual({ fr: 'seul-fr', en: 'seul-fr' })
    await payload.update({ collection: 'pages', id: created.id, data: { _status: 'draft' }, locale: 'en', overrideAccess: true })
    expect(await pageSlugs({ payload, id: created.id })).toEqual({ fr: 'seul-fr' })
    expect(await pageSlugs({ payload, id: created.id, user: { ...staff, collection: 'users' } })).toEqual({ fr: 'seul-fr', en: 'seul-fr' })
  })

  it('keeps the slug home in every language', async () => {
    const home = await payload.create({ collection: 'pages', data: { title: 'Accueil', slug: 'home', _status: 'published' }, locale: 'fr', overrideAccess: true })
    await payload.update({ collection: 'pages', id: home.id, data: { title: 'Welcome', _status: 'published' }, locale: 'en', overrideAccess: true })
    const result = await lookupPage({ payload, locale: 'en', slug: 'home' })
    expect(result.kind).toBe('page')
    if (result.kind === 'page') expect(result.page.title).toBe('Welcome')
    expect(await pageSlugs({ payload, id: home.id })).toEqual({ fr: 'home', en: 'home' })
    // Unpublished in English, the English home page is a 404, not a redirect to itself.
    await payload.update({ collection: 'pages', id: home.id, data: { _status: 'draft' }, locale: 'en', overrideAccess: true })
    expect((await lookupPage({ payload, locale: 'en', slug: 'home' })).kind).toBe('notFound')
    expect((await lookupPage({ payload, locale: 'fr', slug: 'home' })).kind).toBe('page')
  })

  it('answers not found for an unknown slug', async () => {
    expect((await lookupPage({ payload, locale: 'en', slug: 'nope' })).kind).toBe('notFound')
  })

  it('gives every language a slug for hreflang, French filling the gaps', async () => {
    expect(await pageSlugs({ payload, id: aboutId })).toEqual({ fr: 'a-propos', en: 'about' })
    const livraison = await payload.find({ collection: 'pages', where: { slug: { equals: 'livraison' } }, overrideAccess: true })
    expect(await pageSlugs({ payload, id: livraison.docs[0]!.id })).toEqual({ fr: 'livraison', en: 'livraison' })
  })
})


describeWithCms('resolveLinkHref without a database', () => {
  const page = { _status: 'published', slug: { fr: 'a-propos', en: 'about' } }
  it('builds the path in the requested language, home is the locale root', () => {
    expect(resolveLinkHref({ type: 'page', page }, 'en')).toBe('/en/about')
    expect(resolveLinkHref({ type: 'page', page: { _status: 'published', slug: 'home' } }, 'fr')).toBe('/fr')
  })
  it('keeps site-relative and absolute URLs, drops anything else', () => {
    expect(resolveLinkHref({ type: 'url', url: '/en/shop/x' }, 'en')).toBe('/en/shop/x')
    expect(resolveLinkHref({ type: 'url', url: 'https://example.com' }, 'en')).toBe('https://example.com')
    expect(resolveLinkHref({ type: 'url', url: 'javascript:alert(1)' }, 'en')).toBeNull()
    expect(resolveLinkHref({ type: 'url', url: '//evil.test' }, 'en')).toBeNull()
    expect(resolveLinkHref({ type: 'url', url: '/\\evil.test' }, 'en')).toBeNull()
    expect(resolveLinkHref(null, 'en')).toBeNull()
  })
  it('drops URLs with whitespace or control characters, which browsers strip into //host', () => {
    for (const url of ['/\t/evil.test', '/\n/evil.test', '/\r/evil.test', '/ /evil.test', '/\u0000/evil.test', '/\u007f/evil.test', 'https://exa mple.com']) {
      expect(resolveLinkHref({ type: 'url', url }, 'en'), JSON.stringify(url)).toBeNull()
      expect(isValidLinkUrl(url), JSON.stringify(url)).toBe(false)
    }
    expect(isValidLinkUrl('https://example.com/\t')).toBe(false)
    expect(isValidLinkUrl('/fr/shop/tilleul?x=1#y')).toBe(true)
    // The resolver trims the ends first, like a browser does, so only whitespace inside is refused.
    expect(resolveLinkHref({ type: 'url', url: ' /fr/shop \n' }, 'fr')).toBe('/fr/shop')
  })
  it('returns null for an unloaded or unpublished page', () => {
    expect(resolveLinkHref({ type: 'page', page: 12 }, 'fr')).toBeNull()
    expect(resolveLinkHref({ type: 'page', page: { _status: 'draft', slug: 'x' } }, 'fr')).toBeNull()
  })
})
