import { describe, expect, it } from 'vitest'

import type { ShopConfig } from '@/config'
import { calculateShipping, isShippingCountry } from '@/modules/shop/shipping/calculate'

const shipping: ShopConfig['shipping'] = { flatRate: 490, countries: ['FR', 'BE'] }

describe('calculateShipping', () => {
  it('charges nothing for an empty order', () => {
    expect(calculateShipping({ subtotal: 0 }, shipping)).toEqual({ method: 'flat', amount: 0 })
  })

  it('charges the flat rate for any other order', () => {
    expect(calculateShipping({ subtotal: 1 }, shipping)).toEqual({ method: 'flat', amount: 490 })
    expect(calculateShipping({ subtotal: 2500 }, shipping)).toEqual({ method: 'flat', amount: 490 })
  })

  it('charges the same flat rate for a very large order', () => {
    expect(calculateShipping({ subtotal: 99_999_999_99 }, shipping).amount).toBe(490)
  })

  it('returns 0 for a non-empty order when the flat rate is 0 (free shipping)', () => {
    expect(calculateShipping({ subtotal: 1000 }, { ...shipping, flatRate: 0 }).amount).toBe(0)
  })

  it.each([-1, 10.5, Number.NaN, Infinity, -Infinity])('rejects the subtotal %s', (subtotal) => {
    expect(() => calculateShipping({ subtotal }, shipping)).toThrow(/subtotal/)
  })

  it('rejects a subtotal that is not a number', () => {
    expect(() => calculateShipping({ subtotal: '100' as unknown as number }, shipping)).toThrow(
      /subtotal/,
    )
  })
})

describe('isShippingCountry', () => {
  it('accepts a listed country', () => {
    expect(isShippingCountry('FR', shipping)).toBe(true)
    expect(isShippingCountry('BE', shipping)).toBe(true)
  })

  it('rejects an unlisted country', () => {
    expect(isShippingCountry('DE', shipping)).toBe(false)
  })

  it('is exact: no case folding, no empty code', () => {
    expect(isShippingCountry('fr', shipping)).toBe(false)
    expect(isShippingCountry('', shipping)).toBe(false)
  })

  it('rejects everything when no country is listed', () => {
    expect(isShippingCountry('FR', { ...shipping, countries: [] })).toBe(false)
  })
})
