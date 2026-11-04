import { describe, expect, it } from 'vitest'

import { ProductCard } from '@/modules/shop/components/ProductCard'
import { ProductDetails } from '@/modules/shop/components/ProductDetails'
import { ProductGrid } from '@/modules/shop/components/ProductGrid'

import { describeWithShop } from '../support/modules'
import { hrefs, render } from '../theme/render'
import { heading, internalLink, paragraph, product, richText, squarePhoto, text, urlLink } from './products.fixtures'

// The shop's views rendered to static HTML, from products shaped like a visitor's read at depth 1.
// light.config.ts sets EUR and a display tax rate of 5.5 %.

const NBSP = ' '
const count = (html: string, pattern: RegExp) => html.match(new RegExp(pattern, 'g'))?.length ?? 0

describeWithShop('product views', () => {
  describe('ProductCard', () => {
    it('shows the photo, the name linking to the product page, the summary and the price', () => {
      const html = render(<ProductCard product={product()} locale="fr" />)
      expect(hrefs(html)).toEqual(['/fr/shop/verveine-odorante'])
      expect(html).toMatch(/<h2[^>]*><a [^>]*>Verveine odorante<\/a><\/h2>/)
      expect(html).toContain('Citronnée et vive, feuilles entières')
      expect(html).toContain(`7,90${NBSP}€`)
      expect(html).toContain('alt="Pieds de verveine odorante en été"')
      // Width variants only: the og crop has another shape.
      expect(html).toContain(
        'srcSet="/api/media/file/verveine-400x400.webp 400w, /api/media/file/verveine-800x800.webp 800w, /api/media/file/verveine-1200x1200.webp 1200w"',
      )
      expect(html).not.toContain('1200x630')
      expect(html).toContain('loading="lazy"')
      expect(html).not.toContain('Épuisé')
    })

    it('formats the price and the address for the locale', () => {
      const html = render(<ProductCard product={product()} locale="en" />, 'en')
      expect(hrefs(html)).toEqual(['/en/shop/verveine-odorante'])
      expect(html).toContain('€7.90')
    })

    it('says "sold out" in words when the stock is 0, and keeps the price', () => {
      const fr = render(<ProductCard product={product({ inventory: 0 })} locale="fr" />)
      expect(fr).toContain('>Épuisé</span>')
      expect(fr).toContain(`7,90${NBSP}€`)
      expect(render(<ProductCard product={product({ inventory: 0 })} locale="en" />, 'en')).toContain('>Sold out</span>')
    })

    it('takes a heading level for blocks that have their own heading', () => {
      expect(render(<ProductCard product={product()} locale="fr" headingLevel={3} />)).toMatch(/<h3[^>]*><a /)
    })

    it('keeps its tile without a photo, and shows no price when the price is off', () => {
      const html = render(<ProductCard product={product({ images: [], priceInEUREnabled: false })} locale="fr" />)
      expect(html).not.toContain('<img')
      expect(html).not.toContain('€')
      expect(html).toContain('aspect-square')
    })
  })

  describe('ProductGrid', () => {
    it('lists the products under the shop heading, with the tax note', () => {
      const products = [product(), product({ id: 2, title: 'Tilleul', slug: 'tilleul', inventory: 0 })]
      const html = render(<ProductGrid products={products} locale="fr" />)
      expect(count(html, /<h1/)).toBe(1)
      expect(html).toContain('>Boutique</h1>')
      expect(html).toContain(`Prix TTC, TVA 5,5${NBSP}% incluse.`)
      expect(hrefs(html)).toEqual(['/fr/shop/verveine-odorante', '/fr/shop/tilleul'])
      expect(count(html, /<li/)).toBe(2)
      expect(count(html, />Épuisé</)).toBe(1)
      expect(render(<ProductGrid products={products} locale="en" />, 'en')).toContain('Prices include 5.5% VAT.')
    })

    it('says so when there are no products', () => {
      const html = render(<ProductGrid products={[]} locale="fr" />)
      expect(html).toContain('Aucun produit pour le moment.')
      expect(html).not.toContain('<ul')
      expect(html).not.toContain('TVA')
    })
  })

  describe('ProductDetails', () => {
    const slot = <button type="button">ADD TO CART</button>

    it('shows the name, summary, price with the tax rate, stock, facts and description', () => {
      const html = render(<ProductDetails product={product()} locale="fr" addToCart={slot} />)
      expect(count(html, /<h1/)).toBe(1)
      expect(html).toContain('>Verveine odorante</h1>')
      expect(html).toContain('Citronnée et vive, feuilles entières')
      expect(html).toContain(`7,90${NBSP}€`)
      expect(html).toContain(`TVA 5,5${NBSP}% incluse`)
      expect(html).toContain('>En stock<')
      expect(html).toContain('ADD TO CART')
      expect(html).toMatch(/<dt[^>]*>Plante<\/dt><dd[^>]*>Aloysia citrodora, feuilles<\/dd>/)
      expect(html).toMatch(/<dt[^>]*>Poids net<\/dt><dd[^>]*>30 g, environ 25 tasses<\/dd>/)
      expect(html).toContain('<p>La verveine odorante est la plante qui a lancé la ferme.</p>')
      // The way back to the list.
      expect(hrefs(html)).toContain('/fr/shop')
    })

    it('writes price and tax the English way in English', () => {
      const html = render(<ProductDetails product={product()} locale="en" />, 'en')
      expect(html).toContain('€7.90')
      expect(html).toContain('incl. 5.5% VAT')
      expect(html).toContain('>In stock<')
      expect(hrefs(html)).toContain('/en/shop')
    })

    it('says how many are left when the stock is low', () => {
      expect(render(<ProductDetails product={product({ inventory: 3 })} locale="fr" />)).toContain('Plus que 3 en stock')
      expect(render(<ProductDetails product={product({ inventory: 1 })} locale="fr" />)).toContain('Plus qu’un seul en stock')
      expect(render(<ProductDetails product={product({ inventory: 3 })} locale="en" />, 'en')).toContain('Only 3 left')
      // Stock that is not tracked: the plugin sells it without a limit.
      expect(render(<ProductDetails product={product({ inventory: null })} locale="fr" />)).toContain('>En stock<')
    })

    it('shows "sold out" instead of the add-to-cart control when the stock is 0', () => {
      const html = render(<ProductDetails product={product({ inventory: 0 })} locale="fr" addToCart={slot} />)
      expect(html).toContain('>Épuisé</span>')
      expect(html).toContain('Il n’en reste plus pour le moment.')
      expect(html).not.toContain('ADD TO CART')
      expect(html).not.toContain('En stock')
      // The price stays visible.
      expect(html).toContain(`7,90${NBSP}€`)
    })

    it('shows no price and no add-to-cart for a product without a price', () => {
      const html = render(<ProductDetails product={product({ priceInEUR: null })} locale="fr" addToCart={slot} />)
      expect(html).not.toContain('€')
      expect(html).not.toContain('TVA')
      expect(html).not.toContain('ADD TO CART')
    })

    it('draws the first photo first and eagerly, with no thumbnails for a single photo', () => {
      const html = render(<ProductDetails product={product()} locale="fr" />)
      expect(count(html, /<img/)).toBe(1)
      expect(html).toContain('loading="eager"')
      expect(html).toContain('fetchPriority="high"')
      expect(html).not.toContain('<button')
    })

    it('adds a thumbnail button per photo when there are several', () => {
      const images = [squarePhoto('tilleul', 'Bocal de fleurs de tilleul'), squarePhoto('tilleul-arbre', 'Tilleul en fleurs')]
      const html = render(<ProductDetails product={product({ images })} locale="fr" />)
      expect(count(html, /<button/)).toBe(2)
      expect(html).toContain('aria-label="Afficher la photo 1 sur 2"')
      expect(html).toContain('aria-label="Afficher la photo 2 sur 2"')
      expect(count(html, /aria-pressed="true"/)).toBe(1)
      expect(html).toMatch(/<img [^>]*alt="Bocal de fleurs de tilleul"/)
      expect(html).toContain('src="/api/media/file/tilleul-arbre-400x400.webp"')
      expect(html).toContain('aria-label="Photos du produit"')
    })

    it('keeps only phrasing content in the thumbnail buttons, one per photo even when a photo is attached twice', () => {
      const photo = squarePhoto('menthe', 'Feuilles de menthe séchées')
      const html = render(<ProductDetails product={product({ images: [photo, photo] })} locale="fr" />)
      const buttons = html.match(/<button[\s\S]*?<\/button>/g) ?? []
      expect(buttons).toHaveLength(2)
      for (const button of buttons) expect(button).not.toMatch(/<div/)
    })

    it('keeps the words of links it cannot follow, and the links it can', () => {
      const description = richText(
        heading('h1', 'Le goût'),
        paragraph(
          text('Voir '),
          urlLink('la livraison', '/fr/livraison'),
          text(', '),
          urlLink('le site', 'https://example.com'),
          text(', '),
          urlLink('rien', 'javascript:alert(1)'),
          text(', '),
          internalLink('La Veillée', 'products', { id: 5, slug: 'la-veillee' }),
          text(' et '),
          internalLink('la ferme', 'pages', { id: 3, slug: 'la-ferme' }),
          text('.'),
        ),
      )
      const html = render(<ProductDetails product={product({ description })} locale="fr" />)
      // The page's h1 is the product name: headings in the description start at h2.
      expect(count(html, /<h1/)).toBe(1)
      expect(html).toContain('<h2>Le goût</h2>')
      expect(hrefs(html)).toEqual(expect.arrayContaining(['/fr/livraison', 'https://example.com', '/fr/shop/la-veillee']))
      expect(html).not.toContain('javascript:')
      expect(html).toContain('rien')
      expect(html).toContain(' et la ferme.')
      expect(html).not.toContain('href="#"')
    })

    it('leaves out an empty description and facts', () => {
      const html = render(<ProductDetails product={product({ description: richText(paragraph()), facts: [] })} locale="fr" />)
      expect(html).not.toContain('<dl')
      expect(html).not.toContain('lc-prose')
    })
  })
})
