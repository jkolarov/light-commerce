import { describe, expect, it } from 'vitest'

import { publishedLocales } from '@/modules/shop/products/locales'
import { productPath, shopPath } from '@/modules/shop/products/paths'
import { formatTaxRate, productPrice } from '@/modules/shop/products/price'
import { LOW_STOCK_THRESHOLD, stockState } from '@/modules/shop/products/stock'

import { describeWithShop } from '../support/modules'

describeWithShop('product offer', () => {
  describe('stockState', () => {
    it('is sold out at 0, low up to the threshold, available above it', () => {
      expect(LOW_STOCK_THRESHOLD).toBe(5)
      expect(stockState(0)).toBe('soldOut')
      expect(stockState(1)).toBe('low')
      expect(stockState(5)).toBe('low')
      expect(stockState(6)).toBe('available')
      expect(stockState(48)).toBe('available')
    })

    it('treats empty stock as untracked, so available, like the ecommerce plugin', () => {
      expect(stockState(null)).toBe('available')
      expect(stockState(undefined)).toBe('available')
    })

    it('treats a stock below 0 as sold out', () => {
      expect(stockState(-1)).toBe('soldOut')
    })
  })

  describe('productPrice', () => {
    it('is the price in cents for the configured currency', () => {
      expect(productPrice({ priceInEUR: 790, priceInEUREnabled: true })).toBe(790)
      expect(productPrice({ priceInEUR: 790 })).toBe(790)
    })

    it('is null when the price is switched off, empty or 0 (the plugin refuses to sell those)', () => {
      expect(productPrice({ priceInEUR: 790, priceInEUREnabled: false })).toBeNull()
      expect(productPrice({ priceInEUR: null, priceInEUREnabled: true })).toBeNull()
      expect(productPrice({})).toBeNull()
      expect(productPrice({ priceInEUR: 0 })).toBeNull()
    })
  })

  describe('formatTaxRate', () => {
    it('writes the rate in the locale, without trailing zeros', () => {
      expect(formatTaxRate(5.5, 'fr')).toBe('5,5')
      expect(formatTaxRate(5.5, 'en')).toBe('5.5')
      expect(formatTaxRate(20, 'fr')).toBe('20')
      expect(formatTaxRate(2.1, 'en')).toBe('2.1')
    })
  })

  describe('publishedLocales', () => {
    it('reads one status per language, or one for all', () => {
      expect(publishedLocales({ fr: 'published', en: 'published' }, ['fr', 'en'])).toEqual(['fr', 'en'])
      expect(publishedLocales({ fr: 'published', en: 'draft' }, ['fr', 'en'])).toEqual(['fr'])
      expect(publishedLocales('published', ['fr', 'en'])).toEqual(['fr', 'en'])
      expect(publishedLocales('draft', ['fr', 'en'])).toEqual([])
      expect(publishedLocales(undefined, ['fr', 'en'])).toEqual([])
    })

    it('keeps only the languages the site offers', () => {
      expect(publishedLocales({ fr: 'published', en: 'published' }, ['fr'])).toEqual(['fr'])
    })
  })

  describe('paths', () => {
    it('puts the shop and its products under the locale', () => {
      expect(shopPath('fr')).toBe('/fr/shop')
      expect(productPath('en', 'tilleul')).toBe('/en/shop/tilleul')
    })
  })
})
