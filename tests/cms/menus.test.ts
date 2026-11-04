import { handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, expect, it } from 'vitest'

import type { User } from '@/payload-types'

import { describeWithCms } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

describeWithCms('header and footer menus', () => {
  let test: TestPayload
  let payload: Payload
  let staff: User
  let nav: typeof import('@/modules/cms/frontend')
  let aboutId: number
  let draftedId: number
  let secretId: number

  const page = (title: string, slug?: string) =>
    payload.create({ collection: 'pages', data: { title, ...(slug ? { slug } : {}), _status: 'published' }, locale: 'fr', overrideAccess: true })

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    nav = await import('@/modules/cms/frontend')
    staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@example.com', password: 'pw-staff-1', roles: ['staff'] },
      overrideAccess: true,
    })
    const about = await page('À propos', 'a-propos')
    aboutId = about.id
    await payload.update({ collection: 'pages', id: aboutId, data: { title: 'About', slug: 'about', _status: 'published' }, locale: 'en', overrideAccess: true })
    const drafted = await page('Public title', 'public')
    draftedId = drafted.id
    await payload.update({ collection: 'pages', id: draftedId, data: { _status: 'published' }, publishAllLocales: true, locale: 'fr', overrideAccess: true })
    await payload.update({ collection: 'pages', id: draftedId, data: { title: 'DRAFT TITLE', slug: 'draft-slug', _status: 'draft' }, draft: true, locale: 'fr', overrideAccess: true })
    const secret = await payload.create({ collection: 'pages', data: { title: 'Secret', _status: 'draft' }, locale: 'fr', overrideAccess: true })
    secretId = secret.id
    const link = (data: Record<string, unknown>) => ({ link: data })
    await payload.updateGlobal({
      slug: 'header',
      locale: 'fr',
      overrideAccess: true,
      data: {
        items: [
          link({ type: 'page', page: aboutId, label: 'À propos' }),
          link({ type: 'page', page: secretId, label: 'Secret' }),
          link({ type: 'page', page: draftedId, label: 'Public' }),
          link({ type: 'url', url: 'https://example.com/x', label: 'Externe' }),
          link({ type: 'url', url: '/fr/shop', label: 'Boutique' }),
        ],
      },
    })
    // English: only the first and last labels are translated; the others fall back to French.
    const current = (await payload.findGlobal({ slug: 'header', locale: 'fr', overrideAccess: true })).items!
    await payload.updateGlobal({
      slug: 'header',
      locale: 'en',
      overrideAccess: true,
      data: {
        items: [
          { id: current[0]!.id, link: { label: 'About' } },
          { id: current[1]!.id },
          { id: current[2]!.id },
          { id: current[3]!.id },
          { id: current[4]!.id, link: { label: 'Shop', url: '/en/shop' } },
        ],
      },
    })
    await payload.updateGlobal({
      slug: 'footer',
      locale: 'fr',
      overrideAccess: true,
      data: { text: 'Fait main', items: [link({ type: 'page', page: aboutId, label: 'À propos' })] },
    })
  }, 60_000)

  afterAll(async () => {
    await test.stop()
  })

  it('returns labels and hrefs in French', async () => {
    expect(await nav.getHeaderNav('fr')).toEqual([
      { label: 'À propos', href: '/fr/a-propos' },
      { label: 'Public', href: '/fr/public' },
      { label: 'Externe', href: 'https://example.com/x' },
      { label: 'Boutique', href: '/fr/shop' },
    ])
  })

  it('returns the English label and slug when they exist', async () => {
    const en = await nav.getHeaderNav('en')
    expect(en[0]).toEqual({ label: 'About', href: '/en/about' })
    expect(en).toContainEqual({ label: 'Shop', href: '/en/shop' })
  })

  it('falls back to the French label when the English one is missing', async () => {
    const en = await nav.getHeaderNav('en')
    expect(en).toContainEqual({ label: 'Externe', href: 'https://example.com/x' })
    expect(en).toContainEqual({ label: 'Public', href: '/en/public' })
  })

  it('links a page published from French in English too, and leaves it out of a language it was unpublished in', async () => {
    const frOnly = await page('Seul FR', 'seul-fr')
    await payload.updateGlobal({
      slug: 'footer', locale: 'fr', overrideAccess: true,
      data: { items: [{ link: { type: 'page', page: aboutId, label: 'À propos' } }, { link: { type: 'page', page: frOnly.id, label: 'Seul FR' } }] },
    })
    expect((await nav.getFooterNav('fr')).map((i) => i.label)).toEqual(['À propos', 'Seul FR'])
    expect((await nav.getFooterNav('en')).map((i) => i.href)).toEqual(['/en/about', '/en/seul-fr'])
    // "Unpublish in English" (the admin sends `_status: 'draft'` for that language only).
    await payload.update({ collection: 'pages', id: frOnly.id, data: { _status: 'draft' }, locale: 'en', overrideAccess: true })
    expect((await nav.getFooterNav('fr')).map((i) => i.label)).toEqual(['À propos', 'Seul FR'])
    expect((await nav.getFooterNav('en')).map((i) => i.href)).toEqual(['/en/about'])
  })

  it('returns the footer text, with French fallback, or null when empty', async () => {
    expect(await nav.getFooterText('fr')).toBe('Fait main')
    expect(await nav.getFooterText('en')).toBe('Fait main')
    await payload.updateGlobal({ slug: 'footer', locale: 'fr', overrideAccess: true, data: { text: '', items: [] } })
    expect(await nav.getFooterText('fr')).toBeNull()
  })

  it('leaves out links to unpublished pages and to deleted pages', async () => {
    expect((await nav.getHeaderNav('fr')).map((i) => i.label)).not.toContain('Secret')
    const gone = await page('Temporaire', 'temporaire')
    await payload.updateGlobal({
      slug: 'footer', locale: 'fr', overrideAccess: true,
      data: { items: [{ link: { type: 'page', page: aboutId, label: 'À propos' } }, { link: { type: 'page', page: gone.id, label: 'Temporaire' } }] },
    })
    expect(await nav.getFooterNav('fr')).toHaveLength(2)
    await payload.delete({ collection: 'pages', id: gone.id, overrideAccess: true })
    expect(await nav.getFooterNav('fr')).toEqual([{ label: 'À propos', href: '/fr/a-propos' }])
  })

  it('never shows a newer draft of a linked page to the public', async () => {
    const fr = await nav.getHeaderNav('fr')
    expect(JSON.stringify(fr)).not.toContain('draft-slug')
    expect(fr).toContainEqual({ label: 'Public', href: '/fr/public' })
    for (const locale of ['fr', 'en', 'all'] as const) {
      const read = await payload.findGlobal({ slug: 'header', locale, depth: 2, draft: true, overrideAccess: false })
      expect(JSON.stringify(read)).not.toContain('DRAFT TITLE')
      expect(JSON.stringify(read)).not.toContain('draft-slug')
    }
  })

  it('answers an anonymous REST read with ?draft=true without draft data', async () => {
    const res = await handleEndpoints({
      config: payload.config,
      path: '/api/globals/header',
      request: new Request('http://localhost/api/globals/header?draft=true&depth=2&locale=fr'),
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Public title')
    expect(text).not.toContain('DRAFT TITLE')
    expect(text).not.toContain('draft-slug')
  })

  it('lets anyone read and only staff or owners edit', async () => {
    await payload.updateGlobal({ slug: 'footer', locale: 'fr', overrideAccess: true, data: { text: 'Fait main', items: [] } })
    await expect(payload.findGlobal({ slug: 'footer', overrideAccess: false })).resolves.toMatchObject({ text: 'Fait main' })
    await expect(payload.updateGlobal({ slug: 'footer', data: { text: 'x' }, overrideAccess: false })).rejects.toThrow()
    await expect(
      payload.updateGlobal({ slug: 'footer', data: { text: 'Mis à jour', items: [] }, overrideAccess: false, user: { ...staff, collection: 'users' } }),
    ).resolves.toMatchObject({ text: 'Mis à jour' })
  })

  it('accepts exactly 7 header links, refuses 8, and keeps no versions', async () => {
    const item = { link: { type: 'url', url: '/fr/shop', label: 'x' } } as const
    await expect(payload.updateGlobal({ slug: 'header', locale: 'fr', overrideAccess: true, data: { items: Array(7).fill(item) } })).resolves.toBeTruthy()
    await expect(payload.updateGlobal({ slug: 'header', locale: 'fr', overrideAccess: true, data: { items: Array(8).fill(item) } })).rejects.toThrow()
    await expect(payload.findGlobalVersions({ slug: 'header', overrideAccess: true })).rejects.toThrow()
  })
})
