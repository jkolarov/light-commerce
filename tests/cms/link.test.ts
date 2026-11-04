import type { CollectionConfig, Payload } from 'payload'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { anyone, isStaffOrOwner } from '@/core/access'
import { linkField, resolveLinkHref } from '@/modules/cms/fields/link'

import { describeWithCms } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

// A test-only collection that holds a link, the way a block or a menu will.
const holders: CollectionConfig = {
  slug: 'test-holders',
  access: { read: anyone, create: isStaffOrOwner, update: isStaffOrOwner, delete: isStaffOrOwner },
  fields: [linkField('cta')],
  versions: { drafts: true },
}

describeWithCms('linkField in a collection', () => {
  let test: TestPayload
  let payload: Payload

  beforeAll(async () => {
    test = await startPayload({}, { extraCollections: [holders] })
    payload = test.payload
  }, 60_000)

  afterAll(async () => {
    await test.stop()
  })

  const create = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    // @ts-expect-error test-only collection is not in the generated types
    payload.create({ collection: 'test-holders', data, locale: 'fr', overrideAccess: true, ...extra })

  it('publishes in every language with an empty English label and URL', async () => {
    const holder = (await create({ cta: { type: 'url', label: 'Boutique', url: '/fr/shop' }, _status: 'published' })) as { id: number }
    await expect(
      // @ts-expect-error test-only collection is not in the generated types
      payload.update({ collection: 'test-holders', id: holder.id, data: { _status: 'published' }, publishAllLocales: true, locale: 'fr', overrideAccess: true }),
    ).resolves.toBeTruthy()
  })

  it('still requires the label and the URL in the default language', async () => {
    await expect(create({ cta: { type: 'url', url: '/fr/shop' }, _status: 'published' })).rejects.toThrow()
    await expect(create({ cta: { type: 'url', label: 'x' }, _status: 'published' })).rejects.toThrow()
    await expect(create({ cta: { type: 'url', label: 'x', url: 'javascript:alert(1)' }, _status: 'published' })).rejects.toThrow()
  })

  it('follows a page link, then returns null once the page is unpublished or deleted', async () => {
    const page = await payload.create({ collection: 'pages', data: { title: 'Contact', _status: 'published' }, locale: 'fr', overrideAccess: true })
    const holder = (await create({ cta: { type: 'page', label: 'Contact', page: page.id }, _status: 'published' })) as { id: number }
    const href = async () => {
      // @ts-expect-error test-only collection is not in the generated types
      const read = await payload.findByID({ collection: 'test-holders', id: holder.id, locale: 'fr', depth: 1, overrideAccess: false })
      return resolveLinkHref((read as unknown as { cta: never }).cta, 'fr')
    }
    expect(await href()).toBe('/fr/contact')

    await payload.update({ collection: 'pages', id: page.id, data: { _status: 'draft' }, draft: true, overrideAccess: true })
    expect(await href()).toBe('/fr/contact') // the published version is still live

    await payload.update({ collection: 'pages', id: page.id, data: { _status: 'draft' }, overrideAccess: true })
    expect(await href()).toBeNull()

    await payload.delete({ collection: 'pages', id: page.id, overrideAccess: true })
    expect(await href()).toBeNull()
  })
})
