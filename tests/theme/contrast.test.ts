import { describe, expect, it } from 'vitest'

import { getLightConfig } from '@/config'
import { contrastRatio, parseColour, textPairs } from '@/theme/contrast'

describe('parseColour', () => {
  it('reads hex colours of every length', () => {
    expect(parseColour('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColour('#7A3B6E')).toEqual({ r: 122, g: 59, b: 110, a: 1 })
    expect(parseColour('#0008')).toEqual({ r: 0, g: 0, b: 0, a: 0x88 / 255 })
    expect(parseColour('#7a3b6e80')).toEqual({ r: 122, g: 59, b: 110, a: 0x80 / 255 })
  })

  it('reads rgb() and rgba(), with commas or spaces, numbers or percentages', () => {
    expect(parseColour('rgb(122 59 110)')).toEqual({ r: 122, g: 59, b: 110, a: 1 })
    expect(parseColour('rgb(122, 59, 110)')).toEqual({ r: 122, g: 59, b: 110, a: 1 })
    expect(parseColour('rgba(122, 59, 110, 0.5)')).toEqual({ r: 122, g: 59, b: 110, a: 0.5 })
    expect(parseColour('rgb(100% 0% 50% / 25%)')).toEqual({ r: 255, g: 0, b: 127.5, a: 0.25 })
  })

  it('refuses formats it cannot check, and says where to add them', () => {
    expect(() => parseColour('oklch(0.45 0.1 330)')).toThrow(/src\/theme\/contrast\.ts/)
    expect(() => parseColour('hsl(300 35% 35%)')).toThrow(/hex or rgb\(\)/)
  })
})

describe('contrastRatio', () => {
  it('follows the WCAG 2 formula', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5)
    // The classic borderline grey.
    expect(contrastRatio('#777', '#fff')).toBeCloseTo(4.48, 2)
    // Order does not matter.
    expect(contrastRatio('#fff', '#777')).toBeCloseTo(contrastRatio('#777', '#fff'), 10)
  })

  it('matches the ratios demo/brand.md lists for the Les Claies palette', () => {
    expect(contrastRatio('#1E2A20', '#F0F2EA')).toBeCloseTo(13.21, 2)
    expect(contrastRatio('#52604F', '#E0E6D5')).toBeCloseTo(5.23, 2)
    expect(contrastRatio('#FFFFFF', '#7A3B6E')).toBeCloseTo(7.84, 2)
  })

  it('lays a see-through text colour over its background first', () => {
    // Half-transparent black on white is mid grey.
    expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#fff')).toBeCloseTo(contrastRatio('rgb(127.5 127.5 127.5)', '#fff'), 5)
  })
})

describe("the repo's light.config.ts", () => {
  const { colors } = getLightConfig().theme

  // WCAG 2 AA for body text: 4.5:1. Each pair is text the theme draws on that background.
  it.each(textPairs(colors))('$label reaches 4.5:1', ({ foreground, background }) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('checks the seven pairs the theme uses', () => {
    expect(textPairs(colors).map((pair) => pair.label)).toEqual([
      'text on background',
      'text on surface',
      'muted on background',
      'muted on surface',
      'primaryContrast on primary',
      'primary on background',
      'primary on surface',
    ])
  })
})
