import { describe, expect, it } from 'vitest'

import { priceCart } from '@/modules/shop/cart/price'
import type { CartProduct } from '@/modules/shop/cart/rules'

// `priceCart`: what a cart costs from today's stored prices, the one calculation the cart page and
// the checkout share. Pure, so no Payload here.

const shop = { currency: 'EUR' as const, shipping: { flatRate: 490, countries: ['FR'] } }

const products = new Map<string, CartProduct>([
  ['1', { id: 1, priceInEUR: 790, priceInEUREnabled: true, inventory: 5 }],
  ['2', { id: 2, priceInEUR: 850, priceInEUREnabled: true, inventory: null }],
])

describe('priceCart', () => {
  it('adds the lines at their stored prices, then the flat shipping', () => {
    const pricing = priceCart(
      [
        { id: 'a', product: 1, quantity: 2 },
        { id: 'b', product: { id: 2 }, quantity: 1 },
      ],
      products,
      shop,
    )
    expect(pricing).toMatchObject({ count: 3, subtotal: 2 * 790 + 850, shipping: 490, total: 2 * 790 + 850 + 490, canCheckout: true })
    expect(pricing.lines.map((line) => line.lineTotal)).toEqual([1580, 850])
  })

  it('charges no shipping for an empty cart, and an empty cart cannot check out', () => {
    expect(priceCart([], products, shop)).toMatchObject({ subtotal: 0, shipping: 0, total: 0, canCheckout: false })
  })

  it.each([0, -1, 2.5, Number.NaN])('flags a line whose stored quantity is %s, leaves it out of the totals, and holds checkout back', (quantity) => {
    // checkCartItems refuses such a write, but a cart can still hold one (written before the rule,
    // or straight into the database). It must not price as a fraction of cents, or as a refund.
    const pricing = priceCart(
      [
        { id: 'a', product: 1, quantity },
        { id: 'b', product: 2, quantity: 1 },
      ],
      products,
      shop,
    )
    expect(pricing.lines[0]).toMatchObject({ problem: { kind: 'badQuantity' }, lineTotal: null })
    expect(pricing.lines[1]).toMatchObject({ problem: null, lineTotal: 850 })
    expect(pricing).toMatchObject({ count: 1, subtotal: 850, shipping: 490, total: 850 + 490, canCheckout: false })
  })

  it('counts a bad line apart from the stock check of the good ones', () => {
    // Without the fix, the NaN quantity made the product's total NaN, and `quantity > stock` was false.
    const pricing = priceCart(
      [
        { id: 'a', product: 1, quantity: Number.NaN },
        { id: 'b', product: 1, quantity: 6 },
      ],
      products,
      shop,
    )
    expect(pricing.lines[1]!.problem).toEqual({ kind: 'notEnoughStock', available: 5 })
  })
})
