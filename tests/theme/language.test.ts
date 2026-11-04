import { describe, expect, it } from 'vitest'

import { languageLinks, switchLocalePath } from '@/theme/language'

describe('switchLocalePath', () => {
  it('swaps the locale prefix and keeps the rest of the path', () => {
    expect(switchLocalePath('/fr/a-propos', 'en')).toBe('/en/a-propos')
    expect(switchLocalePath('/fr/shop/verveine', 'en')).toBe('/en/shop/verveine')
    expect(switchLocalePath('/en/cart', 'fr')).toBe('/fr/cart')
  })

  it('maps a home page to the other home page', () => {
    expect(switchLocalePath('/fr', 'en')).toBe('/en')
    expect(switchLocalePath('/fr/', 'en')).toBe('/en')
  })

  it('keeps the query string (an order page needs its token)', () => {
    expect(switchLocalePath('/fr/order/12', 'en', 'token=abc')).toBe('/en/order/12?token=abc')
    expect(switchLocalePath('/fr/order/12', 'en', '?token=abc')).toBe('/en/order/12?token=abc')
    expect(switchLocalePath('/fr', 'en', 'a=1')).toBe('/en?a=1')
  })

  it('goes to the home page when the path has no locale prefix', () => {
    expect(switchLocalePath('/', 'en')).toBe('/en')
    expect(switchLocalePath('/xx/page', 'en')).toBe('/en')
    expect(switchLocalePath(null, 'fr')).toBe('/fr')
  })
})

describe('languageLinks', () => {
  it('lists the available locales in their own language, the current one marked', () => {
    expect(languageLinks({ pathname: '/fr/la-ferme', current: 'fr', available: ['fr', 'en'] })).toEqual([
      { locale: 'fr', name: 'Français', href: '/fr/la-ferme', current: true },
      { locale: 'en', name: 'English', href: '/en/la-ferme', current: false },
    ])
  })

  it('shows only the available locales', () => {
    expect(languageLinks({ pathname: '/en', current: 'en', available: ['en'] })).toEqual([
      { locale: 'en', name: 'English', href: '/en', current: true },
    ])
  })
})
