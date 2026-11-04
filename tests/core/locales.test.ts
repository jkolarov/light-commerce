import { describe, expect, it } from 'vitest'

import { isLocale, locales } from '@/core/i18n/locales'

describe('locales', () => {
  it('knows fr and en', () => {
    expect(locales).toEqual(['fr', 'en'])
  })

  it('accepts only known locale codes, so other URL prefixes get a 404', () => {
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale('FR')).toBe(false)
    expect(isLocale('')).toBe(false)
  })
})
