import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Payload } from 'payload'
import { isValidElement, type ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Product } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { hrefs, render } from '../theme/render'
import { paragraph, richText, text } from './products.fixtures'

// The shop's pages against a real Payload: what visitors can read, in which language, and what
// the routes, metadata and sitemap make of it. Route modules are imported after Payload boots
// (they import the composed config, tests/support/payload.ts).

const NOT_FOUND = { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }

// The product page reads the visitor's cart from its cookie (S16). These renders run outside a
// request: a visitor without a cart.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

const SITE = 'https://lightcommerce.fluxory.dev'

describeWithShop('shop pages', () => {
  let test: TestPayload
  let payload: Payload
  let mediaDir: string
  let photoId: number

  /** Created in French and published in every language, as the admin does it. */
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

  const load = async () => import('@/modules/shop/products/load')

  beforeAll(async () => {
    mediaDir = mkdtempSync(path.join(tmpdir(), 'lc-media-'))
    test = await startPayload({ MEDIA_DIR: mediaDir })
    payload = test.payload
    const data = readFileSync(path.join(import.meta.dirname, '..', 'fixtures', 'photo-2600x1800.png'))
    const photo = await payload.create({
      collection: 'media',
      data: { alt: 'Pieds de verveine' },
      file: { data, mimetype: 'image/png', name: 'verveine.png', size: data.length },
      locale: 'fr',
      overrideAccess: true,
    })
    await payload.update({ collection: 'media', id: photo.id, data: { alt: 'Lemon verbena bushes' }, locale: 'en', overrideAccess: true })
    photoId = photo.id

    // In both languages, with a photo.
    const verveine = await publish({ title: 'Verveine odorante', summary: 'Citronnée et vive', images: [photoId], inventory: 48 })
    await payload.update({
      collection: 'products',
      id: verveine.id,
      data: { title: 'Lemon verbena', summary: 'Bright and lemony', _status: 'published' },
      locale: 'en',
      overrideAccess: true,
    })
    // French only, sold out.
    await publish({
      title: 'Tilleul',
      summary: 'Doux et miellé',
      description: richText(paragraph(text('Le tilleul se cueille.'))),
      facts: [{ label: 'Récolte', value: 'juin 2026' }],
      inventory: 0,
      priceInEUR: 850,
    })
    // Published, then a newer draft over it.
    const changed = await publish({ title: 'Menthe poivrée', summary: 'Fraîche' })
    await payload.update({
      collection: 'products',
      id: changed.id,
      data: { title: 'DRAFT NAME', summary: 'DRAFT SUMMARY', _status: 'draft' },
      draft: true,
      locale: 'fr',
      overrideAccess: true,
    })
    // Never published.
    await payload.create({
      collection: 'products',
      data: { title: 'Pas encore', summary: 'DRAFT ONLY', _status: 'draft' },
      draft: true,
      locale: 'fr',
      overrideAccess: true,
    })
    // Published, then moved to the trash.
    const trashed = await publish({ title: 'Ancienne tisane' })
    await payload.update({ collection: 'products', id: trashed.id, data: { deletedAt: new Date().toISOString() }, overrideAccess: true })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
    rmSync(mediaDir, { recursive: true, force: true })
  })

  describe('loaders', () => {
    it('lists the published products only, in the order they were added', async () => {
      const { findPublishedProducts } = await load()
      const products = await findPublishedProducts(payload, 'fr')
      expect(products.map((p) => p.slug)).toEqual(['verveine-odorante', 'tilleul', 'menthe-poivree'])
      expect(JSON.stringify(products)).not.toContain('DRAFT')
      // Photos come loaded, with their variants.
      const [photo] = products[0]!.images!
      expect(typeof photo === 'object' && photo.variants?.card?.url).toMatch(/\.webp$/)
    })

    it('finds a product by its slug in every language, and nothing for an unknown, draft or trashed one', async () => {
      const { findPublishedProduct } = await load()
      expect((await findPublishedProduct(payload, 'fr', 'verveine-odorante'))?.title).toBe('Verveine odorante')
      expect((await findPublishedProduct(payload, 'en', 'verveine-odorante'))?.title).toBe('Lemon verbena')
      for (const slug of ['nope', 'pas-encore', 'ancienne-tisane']) {
        expect(await findPublishedProduct(payload, 'fr', slug), slug).toBeNull()
      }
    })

    it('reads the published text of a product that has a newer draft', async () => {
      const { findPublishedProduct } = await load()
      for (const locale of ['fr', 'en'] as const) {
        const product = await findPublishedProduct(payload, locale, 'menthe-poivree')
        expect(product?.title, locale).toBe('Menthe poivrée')
        expect(JSON.stringify(product), locale).not.toContain('DRAFT')
      }
    })

    it('shows the French text when the English one is missing', async () => {
      const { findPublishedProduct } = await load()
      const product = await findPublishedProduct(payload, 'en', 'tilleul')
      expect(product?.title).toBe('Tilleul')
      expect(product?.summary).toBe('Doux et miellé')
      expect(product?.facts?.map(({ label, value }) => [label, value])).toEqual([['Récolte', 'juin 2026']])
      expect(JSON.stringify(product?.description)).toContain('Le tilleul se cueille.')
    })
  })

  describe('routes', () => {
    const productRoute = async () => (await import('@/app/(frontend)/[locale]/shop/[slug]/page')).default
    const shopRoute = async () => (await import('@/app/(frontend)/[locale]/shop/page')).default

    const renderRoute = async (page: unknown, locale: 'fr' | 'en' = 'fr') => {
      // The route returns the module's async page component; run it as React would.
      const element = (await page) as ReactElement<Record<string, unknown>>
      expect(isValidElement(element)).toBe(true)
      const Component = element.type as (props: Record<string, unknown>) => Promise<ReactElement>
      return render(await Component(element.props), locale)
    }

    it('shows the product list, sold-out products marked', async () => {
      const Page = await shopRoute()
      const html = await renderRoute(Page({ params: Promise.resolve({ locale: 'fr' }) }))
      expect(html).toContain('>Boutique</h1>')
      expect(hrefs(html)).toEqual(['/fr/shop/verveine-odorante', '/fr/shop/tilleul', '/fr/shop/menthe-poivree'])
      expect(html.match(/>Épuisé</g)).toHaveLength(1)
      expect(html).not.toContain('DRAFT')
    })

    it('is the home page when the CMS is off', async () => {
      const previous = process.env.LIGHT_CI_MODULES
      process.env.LIGHT_CI_MODULES = 'shop'
      try {
        const Home = (await import('@/app/(frontend)/[locale]/page')).default
        const html = await renderRoute(Home({ params: Promise.resolve({ locale: 'en' }) }), 'en')
        expect(html).toContain('>Shop</h1>')
        expect(hrefs(html)).toEqual(['/en/shop/verveine-odorante', '/en/shop/tilleul', '/en/shop/menthe-poivree'])
        expect(html).toContain('Lemon verbena')
      } finally {
        if (previous === undefined) delete process.env.LIGHT_CI_MODULES
        else process.env.LIGHT_CI_MODULES = previous
      }
    })

    it('shows a product page in the other language with the French text filling the gaps', async () => {
      const Page = await productRoute()
      const html = await renderRoute(Page({ params: Promise.resolve({ locale: 'en', slug: 'tilleul' }) }), 'en')
      expect(html).toContain('>Tilleul</h1>')
      expect(html).toContain('Doux et miellé')
      expect(html).toContain('Le tilleul se cueille.')
      expect(html).toContain('€8.50')
      expect(html).toContain('>Sold out</span>')
    })

    it('offers add-to-cart, with the price, for a product that can be bought', async () => {
      const Page = await productRoute()
      const html = await renderRoute(Page({ params: Promise.resolve({ locale: 'fr', slug: 'verveine-odorante' }) }))
      expect(html).toMatch(/<button type="submit"[^>]*><span>Ajouter au panier<\/span><span[^>]*>7,90\u00a0€<\/span><\/button>/)
      expect(html).toMatch(/<input type="number"[^>]*max="48"/)
    })

    it('answers 404 for an unknown, unpublished or trashed product', async () => {
      const Page = await productRoute()
      for (const slug of ['nope', 'pas-encore', 'ancienne-tisane']) {
        const element = (await Page({ params: Promise.resolve({ locale: 'fr', slug }) })) as ReactElement<Record<string, unknown>>
        const Component = element.type as (props: Record<string, unknown>) => Promise<unknown>
        await expect(Component(element.props), slug).rejects.toMatchObject(NOT_FOUND)
      }
    })

    it('never shows draft text, whatever the address asks for', async () => {
      const Page = await productRoute() as (props: unknown) => Promise<unknown>
      const html = await renderRoute(
        Page({ params: Promise.resolve({ locale: 'fr', slug: 'menthe-poivree' }), searchParams: Promise.resolve({ draft: 'true' }) }),
      )
      expect(html).toContain('>Menthe poivrée</h1>')
      expect(html).not.toContain('DRAFT')
    })
  })

  describe('metadata', () => {
    it('gives a product its name, summary, share image and both languages', async () => {
      const { generateMetadata } = await import('@/app/(frontend)/[locale]/shop/[slug]/page')
      const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en', slug: 'verveine-odorante' }) })
      expect(meta.title).toBe('Lemon verbena')
      expect(meta.description).toBe('Bright and lemony')
      expect(meta.alternates).toEqual({
        canonical: `${SITE}/en/shop/verveine-odorante`,
        languages: { fr: `${SITE}/fr/shop/verveine-odorante`, en: `${SITE}/en/shop/verveine-odorante` },
      })
      const images = meta.openGraph?.images as { url: string; width?: number; height?: number; alt?: string }[]
      expect(images).toHaveLength(1)
      expect(images[0]).toMatchObject({ width: 1200, height: 630, alt: 'Lemon verbena bushes' })
      expect(images[0]!.url).toMatch(new RegExp(`^${SITE}/api/media/file/verveine-1200x630\\.webp$`))
    })

    it('has nothing to say about a product visitors cannot see', async () => {
      const { generateMetadata } = await import('@/app/(frontend)/[locale]/shop/[slug]/page')
      expect(await generateMetadata({ params: Promise.resolve({ locale: 'fr', slug: 'pas-encore' }) })).toEqual({})
    })
  })

  describe('sitemap', () => {
    it('lists the shop page and the published products in every language, with alternates', async () => {
      const { productSitemapEntries } = await import('@/modules/shop/products/sitemap')
      const entries = await productSitemapEntries(payload, 'https://example.com/', ['fr', 'en'])
      expect(entries.map((e) => e.url)).toEqual([
        'https://example.com/fr/shop',
        'https://example.com/en/shop',
        'https://example.com/fr/shop/verveine-odorante',
        'https://example.com/en/shop/verveine-odorante',
        'https://example.com/fr/shop/tilleul',
        'https://example.com/en/shop/tilleul',
        'https://example.com/fr/shop/menthe-poivree',
        'https://example.com/en/shop/menthe-poivree',
      ])
      const tilleul = entries.find((e) => e.url === 'https://example.com/en/shop/tilleul')
      expect(tilleul?.alternates?.languages).toEqual({ fr: 'https://example.com/fr/shop/tilleul', en: 'https://example.com/en/shop/tilleul' })
      expect(tilleul?.lastModified).toBeInstanceOf(Date)
      expect(entries[0]?.alternates?.languages).toEqual({ fr: 'https://example.com/fr/shop', en: 'https://example.com/en/shop' })
    })

    it('is what the shop gives the site sitemap, for the configured languages', async () => {
      const { getSitemapEntries } = await import('@/modules/shop/frontend')
      const urls = (await getSitemapEntries()).map((e) => e.url)
      expect(urls).toContain(`${SITE}/fr/shop`)
      expect(urls).toContain(`${SITE}/en/shop/verveine-odorante`)
      expect(urls.some((u) => u.includes('pas-encore') || u.includes('ancienne-tisane'))).toBe(false)
    })
  })

  describe('a product published in one language only', () => {
    // S13's hook publishes every language at once, but a plain update that sets `_status: 'draft'`
    // in one language (an unpublish, not a draft save) leaves the product published in the others.
    // Runs last: the lists above don't expect this product.
    beforeAll(async () => {
      const product = await publish({ title: 'Seul en français', slug: 'seul-en-francais' })
      await payload.update({ collection: 'products', id: product.id, data: { _status: 'draft' }, locale: 'en', overrideAccess: true })
    })

    it('is a page in that language and a 404 in the other', async () => {
      const { findPublishedProduct, findPublishedProducts } = await load()
      expect((await findPublishedProduct(payload, 'fr', 'seul-en-francais'))?.title).toBe('Seul en français')
      expect(await findPublishedProduct(payload, 'en', 'seul-en-francais')).toBeNull()
      expect((await findPublishedProducts(payload, 'fr')).map((p) => p.slug)).toContain('seul-en-francais')
      expect((await findPublishedProducts(payload, 'en')).map((p) => p.slug)).not.toContain('seul-en-francais')
    })

    it('is in the sitemap for that language only', async () => {
      const { productSitemapEntries } = await import('@/modules/shop/products/sitemap')
      const entries = await productSitemapEntries(payload, 'https://example.com', ['fr', 'en'])
      const urls = entries.map((e) => e.url)
      expect(urls).toContain('https://example.com/fr/shop/seul-en-francais')
      expect(urls).not.toContain('https://example.com/en/shop/seul-en-francais')
      const entry = entries.find((e) => e.url === 'https://example.com/fr/shop/seul-en-francais')
      expect(entry?.alternates?.languages).toEqual({ fr: 'https://example.com/fr/shop/seul-en-francais' })
    })

    it('lists only that language in its hreflang alternates', async () => {
      const { generateMetadata } = await import('@/app/(frontend)/[locale]/shop/[slug]/page')
      const meta = await generateMetadata({ params: Promise.resolve({ locale: 'fr', slug: 'seul-en-francais' }) })
      expect(meta.alternates).toEqual({
        canonical: `${SITE}/fr/shop/seul-en-francais`,
        languages: { fr: `${SITE}/fr/shop/seul-en-francais` },
      })
    })
  })
})
