import type { Config, Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getLightConfig } from '@/config'
import { addProductGridToPages } from '@/modules/shop/blocks/ProductGrid/extendPages'
import type { Product } from '@/payload-types'

import { render } from '../theme/render'
import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

// The `productGrid` block: how the shop adds it to the pages (through the config, never an import)
// and what it shows to visitors.

const modules = getLightConfig().modules
const describeWithBoth = describe.skipIf(!(modules.cms && modules.shop))
const describeWithCmsOnly = describe.skipIf(!(modules.cms && !modules.shop))

const pagesWith = (blocks: { slug: string }[]) =>
  ({ collections: [{ slug: 'pages', fields: [{ name: 'layout', type: 'blocks', blocks }] }] }) as unknown as Config

describeWithShop('productGrid: extending the config', () => {
  it('does nothing without a pages collection (the CMS is off)', () => {
    const config = { collections: [{ slug: 'users', fields: [] }] } as unknown as Config
    expect(addProductGridToPages(config)).toBe(config)
    expect(() => addProductGridToPages({} as Config)).not.toThrow()
  })

  it('adds the block to a new list, leaving the original and the rest of the collection alone', () => {
    const shared = [{ slug: 'hero' }]
    const hooks = { beforeOperation: [() => undefined] }
    const config = pagesWith(shared)
    ;(config.collections![0] as { hooks?: unknown }).hooks = hooks
    const next = addProductGridToPages(config)
    const pages = next.collections![0]!
    const layout = pages.fields[0] as { blocks: { slug: string }[] }
    expect(layout.blocks.map((b) => b.slug)).toEqual(['hero', 'productGrid'])
    expect(shared).toEqual([{ slug: 'hero' }])
    expect(pages.hooks).toBe(hooks)
  })

  it('adds the block once', () => {
    const once = addProductGridToPages(pagesWith([]))
    const twice = addProductGridToPages(once)
    expect((twice.collections![0]!.fields[0] as { blocks: unknown[] }).blocks).toHaveLength(1)
  })
})

describeWithCmsOnly('productGrid: shop off', () => {
  let test: TestPayload
  beforeAll(async () => {
    test = await startPayload()
  }, 60_000)
  afterAll(async () => test?.stop())

  it('is not a block of the pages', () => {
    const pages = test.payload.config.collections.find((c) => c.slug === 'pages')!
    const layout = pages.fields.find((f) => 'name' in f && f.name === 'layout') as { blocks: { slug: string }[] }
    expect(layout.blocks.map((b) => b.slug)).not.toContain('productGrid')
  })
})

describeWithBoth('productGrid: both modules on', () => {
  let test: TestPayload
  let payload: Payload
  const ids: Record<string, number> = {}

  const publish = async (title: string, extra: Partial<Product> = {}) => {
    const created = await payload.create({
      collection: 'products',
      data: { title, inventory: 5, priceInEUR: 790, _status: 'published', ...extra } as Product,
      locale: 'fr',
      overrideAccess: true,
    })
    await payload.update({
      collection: 'products',
      id: created.id,
      data: { _status: 'published' },
      publishAllLocales: true,
      locale: 'fr',
      overrideAccess: true,
    })
    ids[title] = created.id
    return created.id
  }

  const component = async () => (await import('@/modules/shop/blocks/ProductGrid/Component')).ProductGridBlock
  const html = async (props: Record<string, unknown>) => {
    const ProductGridBlock = await component()
    const node = await ProductGridBlock({ blockType: 'productGrid', mode: 'latest', locale: 'fr', ...props } as never)
    return node ? render(node) : ''
  }

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    for (const title of ['Alpha', 'Bravo', 'Charlie', 'Delta']) await publish(title)
    await publish('Epuise', { inventory: 0 })
  }, 60_000)
  afterAll(async () => test?.stop())

  it('is a block of the pages, and the pages keep their draft guard and staff-only versions', async () => {
    const pages = payload.config.collections.find((c) => c.slug === 'pages')!
    const layout = pages.fields.find((f) => 'name' in f && f.name === 'layout') as { blocks: { slug: string }[] }
    expect(layout.blocks.map((b) => b.slug)).toEqual(['hero', 'richText', 'imageText', 'callToAction', 'productGrid'])
    const { forcePublishedForPublic } = await import('@/core/access/drafts')
    expect(pages.hooks?.beforeOperation).toContain(forcePublishedForPublic)
    expect(await pages.access!.readVersions!({ req: { payload, user: null } } as never)).toBe(false)
  })

  it('validates the count between 2 and 12 and needs picked products', async () => {
    let n = 0
    const make = (block: Record<string, unknown>) =>
      payload.create({
        collection: 'pages',
        data: { title: `P${n++}`, layout: [{ blockType: 'productGrid', ...block }] } as never,
        locale: 'fr',
        overrideAccess: true,
      })
    await expect(make({ mode: 'latest', count: 1 })).rejects.toThrow()
    await expect(make({ mode: 'latest', count: 13 })).rejects.toThrow()
    await expect(make({ mode: 'selected', products: [] })).rejects.toThrow()
    await expect(make({ mode: 'latest', count: 2 })).resolves.toBeTruthy()
    await expect(make({ mode: 'selected', products: [ids.Alpha] })).resolves.toBeTruthy()
  })

  it('shows the newest N products, with a heading', async () => {
    const out = await html({ heading: 'Nos best-sellers', count: 3 })
    expect(out).toContain('<h2')
    expect(out).toContain('Nos best-sellers')
    expect(out).toContain('Epuise')
    expect(out).toContain('Delta')
    expect(out).toContain('Charlie')
    expect(out).not.toContain('Bravo')
    expect(out).toContain('Épuisé')
  })

  it('shows picked products in the editor order, as ids or loaded documents', async () => {
    const out = await html({ mode: 'selected', products: [ids.Charlie, { id: ids.Alpha }] })
    expect(out.indexOf('Charlie')).toBeGreaterThan(-1)
    expect(out.indexOf('Charlie')).toBeLessThan(out.indexOf('Alpha'))
    expect(out).not.toContain('Bravo')
    expect(out).not.toContain('Nos best-sellers')
  })

  it('leaves out a picked product that is a draft, unpublished, or in the trash', async () => {
    const draftId = await publish('Brouillon')
    await payload.update({ collection: 'products', id: draftId, data: { _status: 'draft' }, draft: true, overrideAccess: true, locale: 'fr' })
    const trashedId = await publish('Corbeille')
    await payload.update({ collection: 'products', id: trashedId, data: { deletedAt: new Date().toISOString() }, overrideAccess: true })
    const neverId = (
      await payload.create({ collection: 'products', data: { title: 'Jamais', _status: 'draft' } as Product, draft: true, overrideAccess: true, locale: 'fr' })
    ).id
    const out = await html({ mode: 'selected', products: [draftId, trashedId, neverId, ids.Bravo] })
    expect(out).toContain('Bravo')
    for (const name of ['Corbeille', 'Jamais']) expect(out).not.toContain(name)
    // The published text stays; the newer draft changes nothing for visitors.
    expect(out).toContain('Brouillon')
  })

  it('hides a published product once it becomes a draft', async () => {
    const id = await publish('Eclipse')
    expect(await html({ mode: 'selected', products: [id] })).toContain('Eclipse')
    await payload.update({
      collection: 'products',
      id,
      data: { _status: 'draft' },
      locale: 'fr',
      overrideAccess: true,
    })
    expect(await html({ mode: 'selected', products: [id] })).toBe('')
  })

  it('renders nothing when there is nothing to show', async () => {
    expect(await html({ mode: 'selected', products: [] })).toBe('')
  })

  it('is skipped, not a crash, when the shop is switched off later', async () => {
    const { RenderBlocks } = await import('@/modules/cms/components/RenderBlocks')
    const { cmsBlockComponents } = await import('@/modules/cms/blocks/components')
    const out = render(
      <RenderBlocks blocks={[{ blockType: 'productGrid', id: 'x', mode: 'latest', count: 4 }]} components={cmsBlockComponents} locale="fr" />,
    )
    expect(out).toBe('')
  })
})
