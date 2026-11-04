import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import { resolveLinkHref, type LinkValue } from '@/modules/cms/fields/link'
import { readNav } from '@/modules/cms/globals/nav'
import { lookupPage } from '@/modules/cms/pages/resolve'
import type { Page, Product } from '@/payload-types'
import { seedDemo, type SeedSummary } from '@/seed'
import { SeedError } from '@/seed/errors'

import { describeWithCms, describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { copyDemo, type DemoCopy } from './demo-copy'

// `pnpm seed` on a fresh database, then again: what the site has afterwards. Runs in every module
// setup; each module's content is checked only when that module is on.

const modules = getLightConfig().modules
const describeWithBoth = describe.skipIf(!(modules.cms && modules.shop))

/** Photos the pages use (heroes, image + text, share images), and the ones the products use. */
const PAGE_PHOTOS = 10
const PRODUCT_PHOTOS = 8

describe('demo seed', () => {
  let app: TestPayload
  let payload: Payload
  let mediaDir: string
  let demo: DemoCopy
  let first: SeedSummary
  const lines: string[] = []
  const owner = { email: 'owner@lesclaies.example', password: 'seed-test-password' }

  const seed = (force = false) => seedDemo(payload, { demoDir: demo.dir, owner, force, log: (line) => lines.push(line) })

  /** Documents in a collection (the trash included); 0 when its module is off. */
  const count = async (collection: 'media' | 'pages' | 'products' | 'users') =>
    payload.collections[collection]
      ? (await payload.count({ collection, overrideAccess: true, ...(collection === 'products' ? { trash: true } : {}) })).totalDocs
      : 0

  const pageBySlug = async (slug: string, locale: Locale = 'fr', depth = 0) => {
    const { docs } = await payload.find({ collection: 'pages', where: { slug: { equals: slug } }, locale, depth, overrideAccess: true })
    if (!docs[0]) throw new Error(`no page ${slug}`)
    return docs[0]
  }

  const productIds = async (slugs: string[]) => {
    const { docs } = await payload.find({ collection: 'products', where: { slug: { in: slugs } }, depth: 0, overrideAccess: true })
    return slugs.map((slug) => docs.find((doc) => doc.slug === slug)?.id)
  }

  const mediaId = async (file: string) => {
    const { docs } = await payload.find({ collection: 'media', where: { filename: { equals: file } }, depth: 0, overrideAccess: true })
    return docs[0]?.id
  }

  /** A page as an anonymous visitor gets it (published, depth 1). */
  const visit = async (slug: string, locale: Locale) => {
    const result = await lookupPage({ payload, locale, slug })
    if (result.kind !== 'page') throw new Error(`${slug} (${locale}): ${result.kind}`)
    return result.page
  }

  /** The `fields` of every link node in a Lexical state. */
  const linkFields = (state: unknown): Record<string, unknown>[] => {
    const found: Record<string, unknown>[] = []
    const walk = (node: { type?: string; fields?: Record<string, unknown>; children?: unknown[]; root?: unknown }) => {
      if (node.type === 'link' && node.fields) found.push(node.fields)
      for (const child of [node.root, ...(node.children ?? [])]) if (child && typeof child === 'object') walk(child as typeof node)
    }
    walk(state as Parameters<typeof walk>[0])
    return found
  }

  type Block = NonNullable<Page['layout']>[number]
  const block = <T extends Block['blockType']>(page: Page, type: T, nth = 0) =>
    (page.layout ?? []).filter((b): b is Extract<Block, { blockType: T }> => b.blockType === type)[nth]

  beforeAll(async () => {
    mediaDir = mkdtempSync(path.join(tmpdir(), 'lc-seed-media-'))
    // The demo with one English text removed, to see the French one shown in its place.
    demo = copyDemo()
    demo.edit('pages/la-ferme.json', (page) => {
      delete page.layout[0].text.en
    })
    app = await startPayload({ MEDIA_DIR: mediaDir })
    payload = app.payload
    first = await seed()
  }, 300_000)

  afterAll(async () => {
    await app?.stop()
    demo?.remove()
    rmSync(mediaDir, { recursive: true, force: true })
  })

  describe('on an empty database', () => {
    it('creates the owner account from SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD', async () => {
      const { docs } = await payload.find({ collection: 'users', overrideAccess: true })
      expect(docs.map((user) => [user.email, user.roles])).toEqual([[owner.email, ['owner']]])
      const login = await payload.login({ collection: 'users', data: owner, overrideAccess: true })
      expect(login.user?.email).toBe(owner.email)
      expect(first.owner).toBe('created')
    })

    it('never writes the password to its output', () => {
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.join('\n')).not.toContain(owner.password)
    })

    it('uploads the photos the loaded content uses, with alt text in both languages', async () => {
      const expected = (modules.cms ? PAGE_PHOTOS : 0) + (modules.shop ? PRODUCT_PHOTOS : 0)
      expect(await count('media')).toBe(expected)
      const photo = modules.cms ? 'garrigue.jpg' : 'verveine.jpg'
      const id = await mediaId(photo)
      const fr = await payload.findByID({ collection: 'media', id: id!, locale: 'fr', overrideAccess: true })
      const en = await payload.findByID({ collection: 'media', id: id!, locale: 'en', overrideAccess: true })
      const alt = JSON.parse(readFileSync(path.join(demo.dir, 'content', 'media.json'), 'utf8')).find(
        (entry: { file: string }) => entry.file === photo,
      ).alt
      expect([fr.alt, en.alt]).toEqual([alt.fr, alt.en])
      // Variants are made on upload.
      expect(fr.variants?.card?.url).toMatch(/\.webp$/)
    })
  })

  describeWithCms('pages and menus', () => {
    it('creates the six pages, published in French and English', async () => {
      expect(await count('pages')).toBe(6)
      const slugs: Record<Locale, string[]> = {
        fr: ['home', 'tisanes', 'la-ferme', 'contact', 'livraison', 'mentions-legales'],
        en: ['home', 'herbal-teas', 'the-farm', 'contact', 'shipping', 'legal'],
      }
      for (const locale of ['fr', 'en'] as const) {
        for (const slug of slugs[locale]) expect((await visit(slug, locale))._status, `${locale}/${slug}`).toBe('published')
      }
    })

    it('fills the SEO fields from seo.*, with the share image', async () => {
      const fr = await visit('home', 'fr')
      const en = await visit('home', 'en')
      const { seo } = JSON.parse(readFileSync(path.join(demo.dir, 'content', 'pages', 'home.json'), 'utf8'))
      expect([fr.meta?.title, en.meta?.title]).toEqual([seo.title.fr, seo.title.en])
      expect([fr.meta?.description, en.meta?.description]).toEqual([seo.description.fr, seo.description.en])
      expect(typeof fr.meta?.image === 'object' && fr.meta.image?.filename).toBe('mains-fleurs.jpg')
    })

    it('builds the home page blocks in order, with their links resolved per language', async () => {
      const fr = await visit('home', 'fr')
      const expected = ['hero', ...(modules.shop ? ['productGrid'] : []), 'imageText', 'richText', 'callToAction']
      expect(fr.layout?.map((b) => b.blockType)).toEqual(expected)
      const hero = block(fr, 'hero')!
      expect(resolveLinkHref(hero.link as LinkValue, 'fr')).toBe('/fr/tisanes')
      expect(resolveLinkHref(block(await visit('home', 'en'), 'hero')!.link as LinkValue, 'en')).toBe('/en/herbal-teas')
      expect(typeof hero.image === 'object' && hero.image.filename).toBe('mains-fleurs.jpg')
      const imageText = block(fr, 'imageText')!
      expect(imageText).toMatchObject({ imagePosition: 'right', heading: expect.stringContaining('Combe-Rousse') })
    })

    it('converts Markdown to Lexical, with page: links as internal links to the page', async () => {
      const legal = await pageBySlug('mentions-legales')
      const livraison = await pageBySlug('livraison')
      const json = JSON.stringify(block(legal, 'richText')!.content)
      expect(json).toContain('"type":"heading"')
      expect(json).toContain('"listType":"bullet"')
      expect(json).not.toContain('page:')
      const links = linkFields(block(legal, 'richText')!.content)
      expect(links).toContainEqual({ linkType: 'internal', doc: { relationTo: 'pages', value: livraison.id }, newTab: false })
      expect(links.every((fields) => fields.linkType === 'internal')).toBe(true)
    })

    it('turns a quote with its sign-off into one quote, without a stray ">"', async () => {
      const ferme = await pageBySlug('la-ferme')
      const json = JSON.stringify(block(ferme, 'richText')!.content)
      expect(json).toContain('"type":"quote"')
      expect(json).toContain('— Hélène')
      expect(json).not.toMatch(/ >"/)
    })

    it('shows the French text where the English one is missing', async () => {
      const fr = block(await visit('la-ferme', 'fr'), 'hero')!
      const en = block(await visit('the-farm', 'en'), 'hero')!
      expect(fr.text).toBeTruthy()
      expect(en.text).toBe(fr.text)
      expect(en.heading).not.toBe(fr.heading)
    })

    it('keeps French typography', async () => {
      expect(JSON.stringify((await visit('tisanes', 'fr')).layout)).toContain(' ')
    })

    it('sets the header and footer menus, in order, with the footer line', async () => {
      const header = await readNav({ payload, global: 'header', locale: 'fr' })
      expect(header).toEqual([
        { label: 'Nos tisanes', href: '/fr/tisanes' },
        { label: 'La ferme', href: '/fr/la-ferme' },
        { label: 'Livraison', href: '/fr/livraison' },
        { label: 'Contact', href: '/fr/contact' },
      ])
      const footer = await readNav({ payload, global: 'footer', locale: 'en' })
      expect(footer.map((item) => item.href)).toEqual(['/en/herbal-teas', '/en/the-farm', '/en/shipping', '/en/contact', '/en/legal'])
      expect(footer[4]!.label).toBe('Legal notice and terms')
      const text = await payload.findGlobal({ slug: 'footer', locale: 'en', overrideAccess: true })
      expect(text.text).toBe('Herbal tea plants grown and dried in the Baronnies')
    })
  })

  describeWithShop('products', () => {
    it('creates the six products in catalogue order, with price, stock and photos', async () => {
      expect(await count('products')).toBe(6)
      const { docs } = await payload.find({ collection: 'products', sort: 'createdAt', depth: 1, locale: 'fr', overrideAccess: false })
      expect(docs.map((p) => [p.slug, p.priceInEUR, p.inventory])).toEqual([
        ['verveine-odorante', 790, 48],
        ['tilleul', 850, 30],
        ['menthe-poivree', 690, 40],
        ['fleurs-de-mauve', 950, 12],
        ['la-veillee', 890, 36],
        ['coffret-quatre-tisanes', 1900, 15],
      ])
      const tilleul = docs[1] as Product
      expect(tilleul.images?.map((image) => typeof image === 'object' && image.filename)).toEqual(['tilleul.jpg', 'tilleul-arbre.jpg'])
      expect(tilleul.priceInEUREnabled).toBe(true)
    })

    it('stores name, summary, description and facts per language, published in both', async () => {
      const [id] = await productIds(['verveine-odorante'])
      const fr = await payload.findByID({ collection: 'products', id: id!, locale: 'fr', overrideAccess: false })
      const en = await payload.findByID({ collection: 'products', id: id!, locale: 'en', overrideAccess: false })
      expect([fr.title, en.title]).toEqual(['Verveine odorante', 'Lemon verbena'])
      expect([fr.summary, en.summary]).toEqual(['Citronnée et vive, feuilles entières', 'Bright and lemony, whole leaves'])
      expect(fr.facts?.map((fact) => fact.label)).toEqual(['Plante', 'Récolte', 'Séchage', 'Poids net'])
      expect(en.facts?.map((fact) => fact.value)).toEqual([
        'Aloysia citrodora, leaves',
        'June to October 2026',
        'in the shade, on racks, 5 days',
        '30 g, about 25 cups',
      ])
      const paragraphs = (en.description?.root.children ?? []).filter((node) => node.type === 'paragraph')
      expect(paragraphs).toHaveLength(2)
      expect(JSON.stringify(en.description)).toContain('Lemon verbena is the plant')
    })
  })

  describeWithBoth('pages with products', () => {
    it('fills product grids with the products picked, in order', async () => {
      const home = await pageBySlug('home')
      const grid = block(home, 'productGrid')!
      expect(grid.mode).toBe('selected')
      expect(grid.products).toEqual(await productIds(['verveine-odorante', 'tilleul', 'fleurs-de-mauve', 'la-veillee']))
      const tisanes = block(await pageBySlug('tisanes'), 'productGrid')!
      expect(tisanes.products).toHaveLength(6)
    })

    it('turns product links into links to the product page in each language', async () => {
      for (const [slug, locale] of [['tisanes', 'fr'], ['herbal-teas', 'en']] as const) {
        const cta = block(await visit(slug, locale), 'callToAction')!
        expect(resolveLinkHref(cta.link as LinkValue, locale)).toBe(`/${locale}/shop/coffret-quatre-tisanes`)
      }
    })
  })

  describe.skipIf(!modules.cms || modules.shop)('pages without the shop', () => {
    it('leaves out product grids and the blocks that only link to a product', async () => {
      const tisanes = await pageBySlug('tisanes')
      expect(tisanes.layout?.map((b) => b.blockType)).toEqual(['hero', 'imageText'])
      expect(first.skipped.join('\n')).toMatch(/productGrid/)
    })
  })

  describe('run again', () => {
    it('updates the same documents and restores the demo values (stock included)', async () => {
      const before = { media: await count('media'), pages: await count('pages'), products: await count('products') }
      if (modules.shop) {
        const [id] = await productIds(['verveine-odorante'])
        await payload.update({ collection: 'products', id: id!, data: { inventory: 3, _status: 'published' }, overrideAccess: true })
      }
      if (modules.cms) {
        const home = await pageBySlug('home')
        await payload.update({ collection: 'pages', id: home.id, data: { title: 'Changed', _status: 'published' }, locale: 'fr', overrideAccess: true })
      }
      const homeId = modules.cms ? (await pageBySlug('home')).id : undefined

      const again = await seed()

      expect({ media: await count('media'), pages: await count('pages'), products: await count('products') }).toEqual(before)
      expect(await count('users')).toBe(1)
      expect(again.owner).toBe('kept')
      if (modules.shop) {
        const [id] = await productIds(['verveine-odorante'])
        const product = await payload.findByID({ collection: 'products', id: id!, overrideAccess: true })
        expect(product.inventory).toBe(48)
      }
      if (modules.cms) {
        const home = await pageBySlug('home')
        expect(home.id).toBe(homeId)
        expect(home.title).not.toBe('Changed')
        expect((await readNav({ payload, global: 'header', locale: 'en' })).length).toBe(4)
      }
    }, 300_000)

    it('refuses a database with content the demo does not have, and names it', async () => {
      const data = readFileSync(path.join(import.meta.dirname, '..', 'fixtures', 'small-300x200.png'))
      await payload.create({
        collection: 'media',
        data: { alt: 'Une autre photo' },
        file: { data, mimetype: 'image/png', name: 'other-photo.png', size: data.length },
        overrideAccess: true,
      })
      const before = await count('media')
      const error = await seed().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(SeedError)
      expect(String((error as Error).message)).toMatch(/other-photo\.png/)
      expect(String((error as Error).message)).toMatch(/--force/)
      expect(await count('media')).toBe(before)
    })

    it('with --force, deletes all content but the user accounts, says so, and loads the demo', async () => {
      await payload.create({
        collection: 'users',
        data: { email: 'staff@lesclaies.example', password: 'staff-password', roles: ['staff'] },
        overrideAccess: true,
      })
      lines.length = 0
      const forced = await seed(true)

      expect(await mediaId('other-photo.png')).toBeUndefined()
      expect(await count('media')).toBe((modules.cms ? PAGE_PHOTOS : 0) + (modules.shop ? PRODUCT_PHOTOS : 0))
      if (modules.cms) expect(await count('pages')).toBe(6)
      if (modules.shop) expect(await count('products')).toBe(6)
      expect(await count('users')).toBe(2)
      expect(forced.wiped?.media).toBeGreaterThan(0)
      expect(lines.join('\n')).toMatch(/--force: deleted .*media.*user accounts are kept/is)
    }, 300_000)
  })
})
