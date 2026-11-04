import { describe, expect, it } from 'vitest'

import { getLightConfig } from '@/config'
import type { LightConfig } from '@/config/schema'
import { appearancePairs, checkoutColours, stripeAppearance } from '@/modules/shop/payments/stripe/appearance'
import { contrastRatio } from '@/theme/contrast'

// Stripe's Payment Element takes the theme's colours and font, and passes the same contrast checks
// as the rest of the site (WCAG 2 AA: 4.5:1 for text, 3:1 for input borders).

const theme = getLightConfig().theme

const palettes: Record<string, LightConfig['theme']['colors']> = {
  'light.config.ts': theme.colors,
  'the default theme (globals.css)': {
    primary: '#1f3a5f',
    primaryContrast: '#ffffff',
    background: '#ffffff',
    surface: '#f4f4f2',
    text: '#1c1c1a',
    muted: '#5f5f5a',
  },
  'a dark theme': {
    primary: '#F2C14E',
    primaryContrast: '#1A1A1A',
    background: '#15171A',
    surface: '#22252A',
    text: '#F3F1EC',
    muted: '#B8B4AA',
  },
}

describe('Stripe appearance', () => {
  it('uses the theme’s colours and body font', () => {
    const { variables } = stripeAppearance(theme)
    expect(variables).toMatchObject({
      colorPrimary: theme.colors.primary,
      colorBackground: theme.colors.background,
      colorText: theme.colors.text,
      colorTextSecondary: theme.colors.muted,
      accessibleColorOnColorPrimary: theme.colors.primaryContrast,
      colorDanger: checkoutColours(theme.colors).danger,
    })
    // The body font's name, then its fallbacks: Stripe's iframe can't load the site's font files.
    expect(variables!.fontFamily).toMatch(new RegExp(`^"${theme.fonts.body}", .*(sans-serif|serif)$`))
  })

  it.each(Object.entries(palettes))('passes the contrast checks with %s', (_, colors) => {
    for (const { label, foreground, background, min } of appearancePairs(stripeAppearance({ ...theme, colors }))) {
      expect(contrastRatio(foreground, background), label).toBeGreaterThanOrEqual(min)
    }
  })

  it('keeps errors readable on the surface too, and falls back to the text colour when no red is', () => {
    const { danger } = checkoutColours(theme.colors)
    expect(contrastRatio(danger, theme.colors.surface)).toBeGreaterThanOrEqual(4.5)
    // A mid-grey page where none of the reds reads well.
    const grey = { ...palettes['light.config.ts']!, background: '#8a8a8a', surface: '#8a8a8a', text: '#000000' }
    expect(checkoutColours(grey).danger).toBe('#000000')
  })

  it('falls back to the theme’s own colours when it cannot read them', () => {
    const oklch = { ...theme.colors, background: 'oklch(0.97 0.01 120)' }
    expect(checkoutColours(oklch)).toEqual({ danger: oklch.text, inputBorder: oklch.muted })
  })
})
