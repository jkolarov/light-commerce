import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { LinePricesTable } from '@/modules/shop/admin/LinePrices'

import { describeWithShop } from '../support/modules'

// An order's `linePrices` in the admin: a table, not raw JSON.

const lines = [
  { product: 7, quantity: 2, unitPrice: 1250, lineTotal: 2500 },
  { product: 9, quantity: 1, unitPrice: 899, lineTotal: 899 },
]
const names = new Map([['7', 'Tisane du soir']])

const render = (language: string) =>
  renderToStaticMarkup(<LinePricesTable lines={lines} names={names} subtotal={3399} shippingAmount={490} total={3399 + 490} currency="EUR" language={language} />)

describeWithShop('order line prices in the admin', () => {
  it('shows a French table of products, quantities, prices and the total', () => {
    const html = render('fr').replace(/ | /g, ' ')
    expect(html).toContain('<table')
    for (const heading of ['Produit', 'Quantité', 'Prix unitaire', 'Total ligne', 'Total de la commande']) expect(html).toContain(heading)
    expect(html).toContain('Tisane du soir')
    expect(html).toContain('12,50 €')
    expect(html).toContain('25,00 €')
    expect(html).toContain('8,99 €')
    expect(html).toContain('33,99 €')
    expect(html).toContain('4,90 €')
    expect(html).toContain('38,89 €')
    expect(3399 + 490).toBe(3889) // subtotal + shipping = total
    expect(html.indexOf('Sous-total')).toBeLessThan(html.indexOf('Livraison'))
    expect(html.indexOf('Livraison')).toBeLessThan(html.indexOf('Total de la commande'))
    expect(html).not.toContain('{')
  })

  it('shows the English headings and money in English', () => {
    const html = render('en')
    for (const heading of ['Product', 'Quantity', 'Unit price', 'Line total', 'Order total']) expect(html).toContain(heading)
    expect(html).toContain('€12.50')
    expect(html).toContain('€38.89')
  })

  it('names a product that is gone by its id, and says so when there are no lines', () => {
    expect(render('en')).toContain('#9')
    const empty = renderToStaticMarkup(<LinePricesTable lines={[]} names={new Map()} total={null} currency="EUR" language="en" />)
    expect(empty).toContain('No lines.')
    expect(empty).not.toContain('<table')
  })
})
