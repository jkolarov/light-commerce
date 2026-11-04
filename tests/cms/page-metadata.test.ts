import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { describeWithCms } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

// The CMS page's title: the site name appears once (the layout template adds it, unless the
// page's SEO title already ends with it).

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

describeWithCms('cms page metadata: title', () => {
  let test: TestPayload

  const publish = async (data: Record<string, unknown>) => {
    const page = await test.payload.create({
      collection: 'pages',
      data: { _status: 'published', ...data } as never,
      locale: 'fr',
      overrideAccess: true,
    })
    await test.payload.update({ collection: 'pages', id: page.id, data: { _status: 'published' }, publishAllLocales: true, locale: 'fr', overrideAccess: true })
  }

  beforeAll(async () => {
    test = await startPayload()
    await publish({ title: 'Nos tisanes', slug: 'nos-tisanes' })
    await publish({ title: 'Accueil', slug: 'home' })
    await publish({ title: 'Livraison', slug: 'livraison', meta: { title: 'Livraison – Les Claies' } })
  }, 60_000)

  afterAll(async () => {
    await test.stop()
  })

  it('leaves the site name to the layout for a plain title', async () => {
    const { cmsPageMetadata } = await import('@/modules/cms/pages/route')
    const meta = await cmsPageMetadata('fr', 'nos-tisanes')
    expect(meta.title).toBe('Nos tisanes')
  })

  it('does not double the site name when the SEO title already ends with it', async () => {
    const { cmsPageMetadata } = await import('@/modules/cms/pages/route')
    const meta = await cmsPageMetadata('fr', 'livraison')
    expect(meta.title).toEqual({ absolute: 'Livraison – Les Claies' })
  })

  it('adds the site name once to the home page, which the layout template does not reach', async () => {
    const { generateMetadata } = await import('@/app/(frontend)/[locale]/page')
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'fr' }) })
    expect(meta.title).toEqual({ absolute: 'Accueil – Les Claies' })
  })
})
