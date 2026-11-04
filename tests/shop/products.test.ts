import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, expect, it } from 'vitest'

import type { Product, User } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

describeWithShop('products', () => {
  let test: TestPayload
  let payload: Payload
  let mediaDir: string
  let staff: User
  let photoId: number

  const asStaff = () => ({ ...staff, collection: 'users' as const })

  /** A product published in every language, with French text only unless more is given. */
  const publish = async (data: Partial<Product>) => {
    const created = await payload.create({
      collection: 'products',
      data: { inventory: 10, priceInEUR: 790, _status: 'published', ...data } as Product,
      locale: 'fr',
      overrideAccess: true,
    })
    return payload.update({
      collection: 'products',
      id: created.id,
      data: { _status: 'published' },
      publishAllLocales: true,
      locale: 'fr',
      overrideAccess: true,
    })
  }

  const rest = (url: string) =>
    handleEndpoints({
      config: payload.config,
      path: new URL(url, 'http://localhost').pathname,
      request: new Request(new URL(url, 'http://localhost')),
    })

  beforeAll(async () => {
    mediaDir = mkdtempSync(path.join(tmpdir(), 'lc-media-'))
    test = await startPayload({ MEDIA_DIR: mediaDir })
    payload = test.payload
    staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@example.com', password: 'pw-staff-1', roles: ['staff'] },
      overrideAccess: true,
    })
    const data = readFileSync(path.join(import.meta.dirname, '..', 'fixtures', 'small-300x200.png'))
    const photo = await payload.create({
      collection: 'media',
      data: { alt: 'Une photo' },
      file: { data, mimetype: 'image/png', name: 'product.png', size: data.length },
      overrideAccess: true,
    })
    photoId = photo.id
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
    rmSync(mediaDir, { recursive: true, force: true })
  })

  it('stores name, summary and description per language, with one slug for both', async () => {
    const product = await publish({ title: 'Verveine odorante', summary: 'Citronnée et vive' })
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { title: 'Lemon verbena', summary: 'Bright and lemony', _status: 'published' },
      locale: 'en',
      overrideAccess: true,
    })
    const fr = await payload.findByID({ collection: 'products', id: product.id, locale: 'fr' })
    const en = await payload.findByID({ collection: 'products', id: product.id, locale: 'en' })
    expect([fr.title, en.title]).toEqual(['Verveine odorante', 'Lemon verbena'])
    expect([fr.summary, en.summary]).toEqual(['Citronnée et vive', 'Bright and lemony'])
    expect(fr.slug).toBe('verveine-odorante')
    expect(en.slug).toBe('verveine-odorante')
  })

  it('shows the French text when the English one is missing', async () => {
    const product = await publish({ title: 'Tilleul', summary: 'Doux et floral' })
    const en = await payload.findByID({ collection: 'products', id: product.id, locale: 'en', overrideAccess: false })
    expect(en.title).toBe('Tilleul')
    expect(en.summary).toBe('Doux et floral')
  })

  it('makes the slug from the French name, in plain ASCII', async () => {
    expect((await publish({ title: 'La Veillée' })).slug).toBe('la-veillee')
    expect((await publish({ title: 'Thé d’été !' })).slug).toBe('the-d-ete')
  })

  it('refuses a slug that another product already has', async () => {
    await publish({ title: 'Menthe poivrée' })
    await expect(publish({ title: 'Autre menthe', slug: 'menthe-poivree' })).rejects.toMatchObject({
      data: { errors: [{ path: 'slug', message: expect.stringMatching(/unique/i) }] },
    })
  })

  it('takes a price in whole cents, 0 or more', async () => {
    const product = await publish({ title: 'Prix entier', priceInEUR: 1250 })
    expect(product.priceInEUR).toBe(1250)
    expect(product.priceInEUREnabled).toBe(true)
    for (const priceInEUR of [12.5, -1]) {
      await expect(publish({ title: `Prix ${priceInEUR}`, priceInEUR }), String(priceInEUR)).rejects.toMatchObject({
        data: { errors: [{ message: expect.stringMatching(/whole number of cents/) }] },
      })
    }
  })

  it('keeps stock as a whole number, 0 or more', async () => {
    const product = await publish({ title: 'Stock', inventory: 48 })
    expect(product.inventory).toBe(48)
    for (const inventory of [2.5, -1]) {
      await expect(publish({ title: `Stock ${inventory}`, inventory }), String(inventory)).rejects.toMatchObject({
        data: { errors: [{ message: expect.stringMatching(/whole number of units/) }] },
      })
    }
  })

  it('takes its photos from media', async () => {
    const product = await publish({ title: 'Mauve', images: [photoId] })
    const read = await payload.findByID({ collection: 'products', id: product.id, overrideAccess: false })
    expect(read.images?.map((image) => (typeof image === 'object' ? image.alt : image))).toEqual(['Une photo'])
  })

  it('keeps facts in display order, each one translated, French filling the gaps', async () => {
    const product = await publish({
      title: 'La Veillée',
      facts: [
        { label: 'Plante', value: 'Tilleul et mauve' },
        { label: 'Poids net', value: '30 g' },
      ],
    })
    const [plant, weight] = product.facts!
    // The rows are shared by both languages: translate each one by its id.
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { facts: [{ id: plant!.id, label: 'Plant', value: 'Linden and mallow' }, { id: weight!.id, label: 'Net weight' }] },
      locale: 'en',
      overrideAccess: true,
    })
    const en = await payload.findByID({ collection: 'products', id: product.id, locale: 'en' })
    expect(en.facts?.map(({ label, value }) => [label, value])).toEqual([
      ['Plant', 'Linden and mallow'],
      ['Net weight', '30 g'],
    ])
    const fr = await payload.findByID({ collection: 'products', id: product.id, locale: 'fr' })
    expect(fr.facts?.map(({ label, value }) => [label, value])).toEqual([
      ['Plante', 'Tilleul et mauve'],
      ['Poids net', '30 g'],
    ])
  })

  it('lets staff create products, and nobody else', async () => {
    await expect(
      payload.create({ collection: 'products', data: { title: 'Anonyme', slug: 'anonyme' }, overrideAccess: false }),
    ).rejects.toThrow()
    const created = await payload.create({
      collection: 'products',
      data: { title: 'Par le staff', _status: 'draft' },
      overrideAccess: false,
      user: asStaff(),
      draft: true,
    })
    expect(created.slug).toBe('par-le-staff')
  })

  it('hides an unpublished product from anonymous visitors, shows it to staff', async () => {
    const draft = await payload.create({
      collection: 'products',
      data: { title: 'Pas encore', _status: 'draft' },
      locale: 'fr',
      draft: true,
      overrideAccess: true,
    })
    const anonymous = await payload.find({ collection: 'products', where: { id: { equals: draft.id } }, draft: true, overrideAccess: false })
    expect(anonymous.docs).toHaveLength(0)
    const forStaff = await payload.find({
      collection: 'products', where: { id: { equals: draft.id } }, draft: true, overrideAccess: false, user: asStaff(),
    })
    expect(forStaff.docs).toHaveLength(1)
  })

  it('keeps draft text and versions from anonymous callers, through the Local API', async () => {
    const product = await publish({ title: 'Public name', summary: 'Public summary' })
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { title: 'DRAFT NAME', summary: 'DRAFT SUMMARY', _status: 'draft' },
      draft: true,
      locale: 'fr',
      overrideAccess: true,
    })
    for (const locale of ['fr', 'en', 'all'] as const) {
      const found = await payload.find({ collection: 'products', where: { id: { equals: product.id } }, draft: true, locale, overrideAccess: false })
      expect(found.docs, locale).toHaveLength(1)
      expect(JSON.stringify(found.docs), locale).not.toContain('DRAFT')
      const byId = await payload.findByID({ collection: 'products', id: product.id, draft: true, locale, overrideAccess: false })
      expect(JSON.stringify(byId), locale).not.toContain('DRAFT')
    }
    await expect(payload.findVersions({ collection: 'products', overrideAccess: false })).rejects.toThrow()

    const forStaff = await payload.findByID({
      collection: 'products', id: product.id, draft: true, locale: 'fr', overrideAccess: false, user: asStaff(),
    })
    expect(forStaff.title).toBe('DRAFT NAME')
    const versions = await payload.findVersions({ collection: 'products', overrideAccess: false, user: asStaff() })
    expect(versions.totalDocs).toBeGreaterThan(0)
  })

  it('keeps draft text, versions and deleted products from anonymous callers, through REST', async () => {
    const product = await publish({ title: 'REST public' })
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { title: 'REST DRAFT', _status: 'draft' },
      draft: true,
      locale: 'fr',
      overrideAccess: true,
    })
    for (const locale of ['fr', 'en', 'all']) {
      const list = await rest(`/api/products?draft=true&locale=${locale}&limit=100`)
      expect(list.status).toBe(200)
      const listBody = await list.text()
      expect(listBody, locale).toContain('REST public')
      expect(listBody, locale).not.toContain('REST DRAFT')
      const one = await rest(`/api/products/${product.id}?draft=true&locale=${locale}`)
      expect(one.status).toBe(200)
      expect(await one.text(), locale).not.toContain('REST DRAFT')
    }
    const versions = await rest('/api/products/versions')
    expect([401, 403]).toContain(versions.status)
    expect(await versions.text()).not.toContain('REST DRAFT')

    // Deleted products go to the trash, where only staff see them.
    const deleted = await publish({ title: 'Retiré de la vente' })
    await payload.update({ collection: 'products', id: deleted.id, data: { deletedAt: new Date().toISOString() }, overrideAccess: true })
    const trash = await rest(`/api/products?trash=true&where[id][equals]=${deleted.id}`)
    expect(await trash.json()).toMatchObject({ totalDocs: 0 })
    const forStaff = await payload.find({
      collection: 'products', where: { id: { equals: deleted.id } }, trash: true, overrideAccess: false, user: asStaff(),
    })
    expect(forStaff.totalDocs).toBe(1)
  })
})
