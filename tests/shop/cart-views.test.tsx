import { describe, expect, it } from 'vitest'

import type { CartLine, CartView } from '@/modules/shop/cart/load'
import { AddToCart } from '@/modules/shop/components/AddToCart'
import { CartControl } from '@/modules/shop/components/CartControl'
import { CartPageView } from '@/modules/shop/components/CartPageView'
import { ProductDetails } from '@/modules/shop/components/ProductDetails'

import { describeWithShop } from '../support/modules'
import { hrefs, render } from '../theme/render'
import { product } from './products.fixtures'

// The cart's views rendered to static HTML: the header's cart button with its drawer, the cart
// page and the product page's add-to-cart, from carts shaped like `loadCart` gives them.

const NBSP = '\u00a0'

const line = (overrides: Partial<CartLine> = {}): CartLine => ({
  id: 'line-1',
  productId: '1',
  title: 'Verveine odorante',
  href: '/fr/shop/verveine-odorante',
  image: { src: '/api/media/file/verveine-400x400.webp', width: 400, height: 400, alt: 'Pieds de verveine' },
  unitPrice: 790,
  quantity: 2,
  lineTotal: 1580,
  maxQuantity: 48,
  problem: null,
  ...overrides,
})

const cart = (lines: CartLine[] = [line()], overrides: Partial<CartView> = {}): CartView => {
  const subtotal = lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0)
  const shipping = subtotal ? 490 : 0
  return {
    id: '7',
    lines,
    count: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotal,
    shipping,
    total: subtotal + shipping,
    currency: 'EUR',
    taxRate: 5.5,
    shipsTo: ['FR'],
    canCheckout: lines.length > 0 && lines.every((l) => !l.problem),
    ...overrides,
  }
}

const tilleul = line({ id: 'line-2', productId: '2', title: 'Tilleul', href: '/fr/shop/tilleul', unitPrice: 850, quantity: 1, lineTotal: 850, maxQuantity: 99, image: null })

describeWithShop('cart views', () => {
  describe('CartControl (the header cart)', () => {
    it('links to the cart page and says how many items the cart holds', () => {
      const html = render(<CartControl locale="fr" cart={cart([line(), tilleul])} />)
      expect(hrefs(html)[0]).toBe('/fr/cart')
      expect(html).toContain('aria-label="Panier, 3 articles"')
      expect(html).toContain('aria-haspopup="dialog"')
      expect(html).toMatch(/<span aria-hidden="true"[^>]*>3<\/span>/)
    })

    it('says the cart is empty, without a count, and in English too', () => {
      expect(render(<CartControl locale="fr" cart={null} />)).toContain('aria-label="Panier, vide"')
      const en = render(<CartControl locale="en" cart={cart([tilleul])} />, 'en')
      expect(en).toContain('aria-label="Cart, 1 item"')
      expect(hrefs(en)[0]).toBe('/en/cart')
    })

    it('draws the drawer closed, named by its heading, with a labelled close button', () => {
      const html = render(<CartControl locale="fr" cart={cart()} />)
      expect(html).toMatch(/<dialog aria-labelledby="([^"]+)"[^>]*>[\s\S]*<h2 id="\1"[^>]*>Votre panier/)
      expect(html).not.toMatch(/<dialog[^>]*\sopen[\s=>]/)
      expect(html).toContain('aria-label="Fermer"')
      expect(html).toContain('role="status"')
    })

    it('has the lines, the total, one checkout button and a "View cart" link in the drawer', () => {
      const html = render(<CartControl locale="fr" cart={cart([line(), tilleul])} />)
      expect(html).toContain('>Verveine odorante</a>')
      expect(html).toContain(`>29,20${NBSP}€</dd>`)
      expect(hrefs(html)).toEqual(['/fr/cart', '/fr/shop/verveine-odorante', '/fr/shop/tilleul', '/fr/checkout', '/fr/cart'])
      expect(html).toContain('>Voir le panier</a>')
      expect(html.match(/>Commander</g)).toHaveLength(1)
    })

    it('shows an empty drawer with a way to the shop and no checkout', () => {
      const html = render(<CartControl locale="fr" cart={cart([])} />)
      expect(html).toContain('Votre panier est vide.')
      expect(hrefs(html)).toEqual(['/fr/cart', '/fr/shop'])
      expect(html).not.toContain('Commander')
    })
  })

  describe('CartPageView', () => {
    it('lists each line with its photo, name, unit price, stepper, remove button and total', () => {
      const html = render(<CartPageView cart={cart([line(), tilleul])} locale="fr" />)
      expect(html).toMatch(/<h1[^>]*>Votre panier<\/h1>/)
      expect(html).toContain('3 articles')
      expect(html).toContain('src="/api/media/file/verveine-400x400.webp"')
      expect(html).toMatch(/<h2[^>]*><a [^>]*href="\/fr\/shop\/verveine-odorante"[^>]*>Verveine odorante<\/a><\/h2>/)
      expect(html).toContain(`7,90${NBSP}€ l’unité`)
      expect(html).toContain(`>15,80${NBSP}€</p>`)
      // The stepper and the remove button say which product they change.
      expect(html).toContain('role="group" aria-label="Quantité de Verveine odorante"')
      expect(html).toContain('aria-label="Diminuer la quantité de Verveine odorante"')
      expect(html).toContain('aria-label="Augmenter la quantité de Verveine odorante"')
      expect(html).toMatch(/<input type="number"[^>]*min="1" max="48"[^>]*value="2"/)
      expect(html).toContain('aria-label="Retirer Verveine odorante du panier"')
    })

    it('shows subtotal, shipping and total, where the shop delivers, the VAT, and the checkout link', () => {
      const html = render(<CartPageView cart={cart([line(), tilleul])} locale="fr" />)
      expect(html).toMatch(new RegExp(`Sous-total</dt><dd[^>]*>24,30${NBSP}€`))
      expect(html).toMatch(new RegExp(`Livraison</dt><dd[^>]*>4,90${NBSP}€`))
      expect(html).toMatch(new RegExp(`Total</dt><dd[^>]*>29,20${NBSP}€`))
      expect(html).toContain('Pays de livraison : France.')
      expect(html).toContain(`TVA 5,5${NBSP}% incluse.`)
      expect(hrefs(html)).toContain('/fr/checkout')
      expect(hrefs(html)).toContain('/fr/shop')
    })

    it('formats money and words for English', () => {
      const html = render(<CartPageView cart={cart([line({ title: 'Lemon verbena', href: '/en/shop/verveine-odorante' })])} locale="en" />, 'en')
      expect(html).toContain('€7.90 each')
      expect(html).toContain('We deliver to: France.')
      expect(html).toContain('Prices include 5.5% VAT.')
      expect(hrefs(html)).toContain('/en/checkout')
    })

    it('flags a sold-out line and one that ran short, and holds checkout back until they are fixed', () => {
      const soldOut = line({ id: 'a', problem: { kind: 'soldOut' }, maxQuantity: 0 })
      const short = line({ id: 'b', productId: '2', title: 'Tilleul', quantity: 4, lineTotal: 3160, maxQuantity: 2, problem: { kind: 'notEnoughStock', available: 2 } })
      const html = render(<CartPageView cart={cart([soldOut, short])} locale="fr" />)
      expect(html).toContain('>Épuisé</span>')
      expect(html).toContain('Épuisé depuis votre ajout. Retirez-le pour commander.')
      expect(html).toContain('Il n’en reste plus que 2 : baissez la quantité pour commander.')
      expect(html).toContain('>Passer à 2</button>')
      // The sold-out line can only be removed; the short one can only go down.
      expect(html).not.toContain('Quantité de Verveine odorante')
      expect(html).toMatch(/aria-label="Augmenter la quantité de Tilleul" aria-disabled="true"/)
      expect(html).toMatch(/aria-label="Diminuer la quantité de Tilleul" aria-disabled="false"/)
      expect(hrefs(html)).not.toContain('/fr/checkout')
      expect(html).toMatch(/<button type="button"[^>]*disabled=""[^>]*aria-describedby="([^"]+)"[^>]*>Commander<\/button><p id="\1"[^>]*>Corrigez les articles signalés pour passer commande\.<\/p>/)
    })

    it('shows a line that is no longer for sale without a name or a price, ready to remove', () => {
      const gone = line({ title: null, href: null, image: null, unitPrice: null, lineTotal: null, maxQuantity: 0, problem: { kind: 'unavailable' } })
      const html = render(<CartPageView cart={cart([gone])} locale="fr" />)
      expect(html).toContain('Produit indisponible')
      expect(html).toContain('Ce produit n’est plus en vente. Retirez-le pour commander.')
      expect(html).toContain('aria-label="Retirer Produit indisponible du panier"')
      expect(hrefs(html)).toEqual(['/fr/shop'])
    })

    it('says an empty cart is empty, points to the shop and offers no checkout', () => {
      for (const empty of [null, cart([])]) {
        const html = render(<CartPageView cart={empty} locale="fr" />)
        expect(html).toContain('Votre panier est vide.')
        expect(html).toContain('Ajoutez un produit depuis la boutique')
        expect(hrefs(html)).toEqual(['/fr/shop'])
        expect(html).not.toContain('Commander')
      }
    })
  })

  describe('AddToCart', () => {
    const props = { productId: 1, name: 'Verveine odorante', unitPrice: 790, currency: 'EUR', locale: 'fr' as const, addable: 3, inCart: 0 }

    it('has a labelled stepper up to the stock left and a button that shows the price', () => {
      const html = render(<AddToCart {...props} />)
      expect(html).toContain('role="group" aria-label="Quantité de Verveine odorante"')
      expect(html).toMatch(/<input type="number"[^>]*min="1" max="3"[^>]*value="1"/)
      expect(html).toMatch(new RegExp(`<button type="submit"[^>]*><span>Ajouter au panier</span><span[^>]*>7,90${NBSP}€</span></button>`))
      expect(html).toContain('aria-live="polite"')
    })

    it('says how many are already in the cart, and stops when they are all there', () => {
      expect(render(<AddToCart {...props} inCart={2} addable={1} />)).toContain('Déjà dans votre panier : 2.')
      const full = render(<AddToCart {...props} inCart={3} addable={0} />)
      expect(full).toContain('Tout le stock restant est déjà dans votre panier.')
      expect(full).not.toContain('type="submit"')
      expect(hrefs(full)).toEqual(['/fr/cart'])
    })

    it('is drawn on the product page only for a product that can be bought', () => {
      const control = <AddToCart {...props} />
      expect(render(<ProductDetails product={product()} locale="fr" addToCart={control} />)).toContain('Ajouter au panier')
      expect(render(<ProductDetails product={product({ inventory: 0 })} locale="fr" addToCart={control} />)).not.toContain('Ajouter au panier')
      expect(render(<ProductDetails product={product({ priceInEUR: null })} locale="fr" addToCart={control} />)).not.toContain('Ajouter au panier')
    })
  })
})
