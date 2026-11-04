import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resolveLinkHref } from '@/modules/cms/fields/link'
import { lookupPage, pageSlugs } from '@/modules/cms/pages/resolve'
import type { User } from '@/payload-types'

import { startPayload, type TestPayload } from '../support/payload'

describe('pages', () => {
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
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: 'pages', data: { title: 'Shop', _status: 'published' }, locale: 'fr', overrideAccess: true }),
    ).rejects.toThrow()
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

  it('keeps a language private until the page is published in it', async () => {
    await payload.create({ collection: 'pages', data: { title: 'Bientôt', _status: 'published' }, locale: 'fr', overrideAccess: true })
    expect((await lookupPage({ payload, locale: 'fr', slug: 'bientot' })).kind).toBe('page')
    expect((await lookupPage({ payload, locale: 'en', slug: 'bientot' })).kind).toBe('notFound')
  })

  it('answers not found for an unknown slug', async () => {
    expect((await lookupPage({ payload, locale: 'en', slug: 'nope' })).kind).toBe('notFound')
  })

  it('gives every language a slug for hreflang, French filling the gaps', async () => {
    expect(await pageSlugs({ payload, id: aboutId })).toEqual({ fr: 'a-propos', en: 'about' })
    const livraison = await payload.find({ collection: 'pages', where: { slug: { equals: 'livraison' } }, overrideAccess: true })
    expect(await pageSlugs({ payload, id: livraison.docs[0]!.id })).toEqual({ fr: 'livraison', en: 'livraison' })
  })

  it('resolveLinkHref follows a page and returns null once it is deleted or unpublished', async () => {
    const target = await payload.create({
      collection: 'pages',
      data: { title: 'Contact', _status: 'published' },
      locale: 'fr',
      overrideAccess: true,
    })
    const link = (id: number) => ({ type: 'page' as const, label: 'x', page: id })
    const read = async () => {
      // A link as a block would hold it: the relationship populated by a depth-1 read.
      const holder = await payload.findByID({ collection: 'pages', id: target.id, depth: 0, overrideAccess: true })
      return holder
    }
    await read()
    const populated = async () => {
      const found = await payload.find({
        collection: 'pages',
        where: { id: { equals: target.id } },
        overrideAccess: false,
      })
      return found.docs[0] ?? target.id
    }
    expect(resolveLinkHref({ type: 'page', page: await populated() }, 'fr')).toBe('/fr/contact')

    await payload.update({ collection: 'pages', id: target.id, data: { _status: 'draft' }, overrideAccess: true })
    expect(resolveLinkHref({ type: 'page', page: await populated() }, 'fr')).toBeNull()

    await payload.delete({ collection: 'pages', id: target.id, overrideAccess: true })
    expect(resolveLinkHref({ type: 'page', page: await populated() }, 'fr')).toBeNull()
    expect(resolveLinkHref(link(target.id), 'fr')).toBeNull()
  })
})

describe('resolveLinkHref without a database', () => {
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
    expect(resolveLinkHref(null, 'en')).toBeNull()
  })
  it('returns null for an unloaded or unpublished page', () => {
    expect(resolveLinkHref({ type: 'page', page: 12 }, 'fr')).toBeNull()
    expect(resolveLinkHref({ type: 'page', page: { _status: 'draft', slug: 'x' } }, 'fr')).toBeNull()
  })
})
