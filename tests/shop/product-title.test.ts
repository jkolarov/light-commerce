import { afterAll, beforeAll, expect, it } from 'vitest'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

// The product page's title: the site name appears once.

describeWithShop('product page metadata: title', () => {
  let test: TestPayload

  const publish = async (title: string, slug: string) => {
    const created = await test.payload.create({
      collection: 'products',
      data: { title, slug, inventory: 3, priceInEUR: 790, _status: 'published' } as never,
      locale: 'fr',
      overrideAccess: true,
    })
    await test.payload.update({ collection: 'products', id: created.id, data: { _status: 'published' }, publishAllLocales: true, locale: 'fr', overrideAccess: true })
  }

  beforeAll(async () => {
    test = await startPayload()
    await publish('Tilleul', 'tilleul')
    await publish('Mélange du soir – Les Claies', 'melange-du-soir')
  }, 60_000)

  afterAll(async () => {
    await test.stop()
  })

  const metaFor = async (slug: string) => {
    const { generateMetadata } = await import('@/app/(frontend)/[locale]/shop/[slug]/page')
    return generateMetadata({ params: Promise.resolve({ locale: 'fr', slug }) })
  }

  it('leaves the site name to the layout for a plain name', async () => {
    expect((await metaFor('tilleul')).title).toBe('Tilleul')
  })

  it('does not double the site name when the product name already ends with it', async () => {
    const meta = await metaFor('melange-du-soir')
    expect(meta.title).toEqual({ absolute: 'Mélange du soir – Les Claies' })
    expect((meta.openGraph as { title?: unknown }).title).toBe('Mélange du soir – Les Claies')
  })
})
