import { expect, it } from 'vitest'

import { formatMoney } from '@/modules/shop/money'

import { describeWithShop } from '../support/modules'

// French puts a no-break space (U+00A0) before the symbol and a narrow no-break space (U+202F)
// between thousands. Spelled out here so a plain space never passes by accident.
const NBSP = ' '
const NNBSP = ' '

describeWithShop('formatMoney', () => {
  it('formats cents in French and English', () => {
    expect(formatMoney(1250, { currency: 'EUR', locale: 'fr' })).toBe(`12,50${NBSP}€`)
    expect(formatMoney(1250, { currency: 'EUR', locale: 'en' })).toBe('€12.50')
  })

  it('formats zero, single cents and thousands', () => {
    expect(formatMoney(0, { currency: 'EUR', locale: 'fr' })).toBe(`0,00${NBSP}€`)
    expect(formatMoney(5, { currency: 'EUR', locale: 'en' })).toBe('€0.05')
    expect(formatMoney(123456789, { currency: 'EUR', locale: 'fr' })).toBe(`1${NNBSP}234${NNBSP}567,89${NBSP}€`)
    expect(formatMoney(123456789, { currency: 'EUR', locale: 'en' })).toBe('€1,234,567.89')
  })

  it('formats a negative amount (a refund)', () => {
    expect(formatMoney(-490, { currency: 'EUR', locale: 'en' })).toBe('-€4.90')
  })

  it("uses the currency's own minor unit", () => {
    // Yen has no minor unit: 1250 is ¥1,250, not ¥12.50.
    expect(formatMoney(1250, { currency: 'JPY', locale: 'en' })).toBe('¥1,250')
  })

  it.each([12.5, Number.NaN, Infinity])('refuses %s: money is a whole number of cents', (cents) => {
    expect(() => formatMoney(cents, { currency: 'EUR', locale: 'fr' })).toThrow(/whole number of cents/)
  })
})
