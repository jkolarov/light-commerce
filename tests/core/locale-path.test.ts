import { describe, expect, it } from 'vitest'

import { localePath } from '@/core/i18n/path'

describe('localePath', () => {
  it('prefixes a path with the locale', () => {
    expect(localePath('fr', '/cart')).toBe('/fr/cart')
    expect(localePath('en', 'shop/a')).toBe('/en/shop/a')
  })
  it('gives the home path for an empty or root path', () => {
    expect(localePath('en')).toBe('/en')
    expect(localePath('en', '/')).toBe('/en')
    expect(localePath('fr', '')).toBe('/fr')
  })
  it('keeps a query or hash', () => {
    expect(localePath('fr', '/cart?x=1')).toBe('/fr/cart?x=1')
    expect(localePath('fr', '?x=1')).toBe('/fr?x=1')
  })
})
