import { rmSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readDemo } from '@/seed/demo'
import { SeedError } from '@/seed/errors'

import { copyDemo, DEMO_DIR, type DemoCopy } from './demo-copy'

// Reading `demo/` (shape in demo/README.md): the seed checks all of it before it writes anything,
// and a broken file stops it with a message naming the file and the field.

describe('demo content', () => {
  let copy: DemoCopy | undefined

  afterEach(() => {
    copy?.remove()
    copy = undefined
  })

  /** The problems `readDemo` reports for a broken copy. */
  const problemsOf = (dir: string): string[] => {
    try {
      readDemo(dir)
    } catch (error) {
      if (error instanceof SeedError) return error.problems
      throw error
    }
    throw new Error('readDemo accepted broken data')
  }

  it('reads the repo demo: 6 pages, 6 products, 18 photos, both menus', () => {
    const demo = readDemo(DEMO_DIR)
    // The home page first, then by file name.
    expect(demo.pages.map((page) => page.slug.fr)).toEqual(['home', 'contact', 'la-ferme', 'livraison', 'mentions-legales', 'tisanes'])
    expect(demo.products.map((product) => product.slug)).toEqual([
      'verveine-odorante',
      'tilleul',
      'menthe-poivree',
      'fleurs-de-mauve',
      'la-veillee',
      'coffret-quatre-tisanes',
    ])
    expect(demo.media).toHaveLength(18)
    expect(demo.menus.header).toHaveLength(4)
    expect(demo.menus.footer).toHaveLength(5)
  })

  it('keeps French typography as it is (no-break spaces, typographic apostrophes)', () => {
    const tisanes = readDemo(DEMO_DIR).pages.find((page) => page.slug.fr === 'tisanes')!
    expect(JSON.stringify(tisanes)).toContain(' ')
    expect(JSON.stringify(tisanes)).toContain('’')
  })

  it('takes the footer line from the taglines in brand.md', () => {
    expect(readDemo(DEMO_DIR).footerText).toEqual({
      fr: 'Plantes à tisane cultivées et séchées dans les Baronnies',
      en: 'Herbal tea plants grown and dried in the Baronnies',
    })
  })

  it('has no footer line when brand.md has no tagline', () => {
    copy = copyDemo()
    rmSync(path.join(copy.dir, 'brand.md'))
    expect(readDemo(copy.dir).footerText).toBeNull()
  })

  it('accepts a value with no English text (the site falls back to French)', () => {
    copy = copyDemo()
    copy.edit('pages/la-ferme.json', (page) => {
      delete page.layout[0].text.en
    })
    const ferme = readDemo(copy.dir).pages.find((page) => page.slug.fr === 'la-ferme')!
    expect(ferme.layout[0]).toMatchObject({ blockType: 'hero', text: { fr: expect.any(String) } })
    expect((ferme.layout[0] as { text?: { en?: string } }).text?.en).toBeUndefined()
  })

  it('names the file and the field of every shape problem, all at once', () => {
    copy = copyDemo()
    copy.edit('products.json', (products) => {
      products[0].price = 7.9
      delete products[1].stock
    })
    copy.edit('pages/home.json', (page) => {
      page.layout[0].colour = 'red'
    })
    copy.edit('menus.json', (menus) => {
      menus.header[0].type = 'shop'
    })
    expect(problemsOf(copy.dir)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^products\.json: \[0\]\.price: .*whole number of cents/),
        'products.json: [1].stock: is missing',
        'pages/home.json: layout[0].colour: unknown field',
        expect.stringMatching(/^menus\.json: header\[0\]\.type: expected "page" or "product"/),
      ]),
    )
  })

  it('names every image, page and product that does not exist', () => {
    copy = copyDemo()
    copy.edit('products.json', (products) => {
      products[1].images = ['nowhere.jpg']
    })
    copy.edit('pages/home.json', (page) => {
      page.layout[0].link.slug = 'nope'
      page.layout[1].products.push('not-a-product')
      page.layout[2].image = 'missing.jpg'
      page.layout[3].content.en += '\n\nSee [our tea](product:earl-grey).'
    })
    copy.edit('media.json', (media) => {
      media.push({ file: 'ghost.jpg', alt: { fr: 'Rien', en: 'Nothing' } })
    })
    expect(problemsOf(copy.dir)).toEqual(
      expect.arrayContaining([
        'products.json: [1].images[0]: "nowhere.jpg" is not in media.json',
        'pages/home.json: layout[0].link.slug: no page "nope" in the demo',
        'pages/home.json: layout[1].products[4]: no product "not-a-product" in the demo',
        'pages/home.json: layout[2].image: "missing.jpg" is not in media.json',
        'pages/home.json: layout[3].content.en: no product "earl-grey" in the demo',
        'media.json: [18].file: images/ghost.jpg does not exist',
      ]),
    )
  })

  it('refuses a page whose file name is not its French slug', () => {
    copy = copyDemo()
    copy.edit('pages/contact.json', (page) => {
      page.slug.fr = 'nous-ecrire'
    })
    expect(problemsOf(copy.dir)).toContainEqual(expect.stringMatching(/^pages\/contact\.json: slug\.fr: .*file name/))
  })

  it('says where to look when demo/ is missing', () => {
    expect(() => readDemo('/nowhere/demo')).toThrow(/demo content.*\/nowhere\/demo/i)
  })
})
