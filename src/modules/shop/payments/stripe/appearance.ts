import type { Appearance } from '@stripe/stripe-js'

import type { LightConfig } from '@/config/schema'
import { contrastRatio, parseColour, type Rgba } from '@/theme/contrast'
import { fontStack } from '@/theme/fonts/families'

// Stripe's Payment Element, themed with its Appearance API from the theme in light.config.ts: the
// same values as the `--lc-*` variables (Stripe draws its form in an iframe, so it needs the
// colours themselves, not the variables). Pure, so a test runs the theme's contrast checks on it
// (tests/shop/stripe-appearance.test.ts).
//
// - The theme has no "danger" colour: the site writes problems in words, in the text colour. For
//   error text and invalid fields, the first of a few reds that reads at 4.5:1 on the page's
//   background and surface is used, or the text colour if none does. (A `theme.colors.danger` in
//   light.config.ts would replace this.)
// - Input borders: the text colour over the background, as strong as it takes to reach 3:1.
// - Fonts: the iframe can't load the site's own font files, so Stripe gets the body font's name
//   and its fallbacks (the system's sans-serif when the font isn't installed).

type Colours = LightConfig['theme']['colors']

export const MIN_TEXT_CONTRAST = 4.5
export const MIN_BORDER_CONTRAST = 3

/** Reds for error text: for light pages first, then for dark ones. */
const DANGER_CANDIDATES = ['#B42318', '#9A1B12', '#7A150E', '#FF8A7A', '#FFB4A9']

const hex = ({ r, g, b }: Rgba) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

/** `top` at `alpha` over the opaque `below`, as an opaque hex colour. */
function blend(top: string, below: string, alpha: number): string {
  const [t, b] = [parseColour(top), parseColour(below)]
  const mix = (x: number, y: number) => x * alpha + y * (1 - alpha)
  return hex({ r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b), a: 1 })
}

export type CheckoutColours = {
  /** Error text and invalid fields. */
  danger: string
  /** Borders of inputs, Stripe's and the checkout form's. */
  inputBorder: string
}

/** The two colours the checkout adds to the theme's (see above). */
export function checkoutColours(colors: Colours): CheckoutColours {
  try {
    const readable = (colour: string) =>
      contrastRatio(colour, colors.background) >= MIN_TEXT_CONTRAST && contrastRatio(colour, colors.surface) >= MIN_TEXT_CONTRAST
    const danger = DANGER_CANDIDATES.find(readable) ?? colors.text
    let inputBorder = colors.text
    for (let alpha = 0.6; alpha < 1; alpha += 0.05) {
      const candidate = blend(colors.text, colors.background, alpha)
      if (contrastRatio(candidate, colors.background) >= MIN_BORDER_CONTRAST) {
        inputBorder = candidate
        break
      }
    }
    return { danger, inputBorder }
  } catch {
    // A colour format contrast.ts can't read (hsl(), oklch()): the theme's own colours.
    return { danger: colors.text, inputBorder: colors.muted }
  }
}

/** The Payment Element's look, from the theme. */
export function stripeAppearance(theme: LightConfig['theme']): Appearance {
  const { colors, fonts } = theme
  const { danger, inputBorder } = checkoutColours(colors)
  // The site's focus ring: `primary`, with a `background` gap.
  const focusRing = `0 0 0 2px ${colors.background}, 0 0 0 4px ${colors.primary}`
  return {
    theme: 'stripe',
    labels: 'above',
    variables: {
      colorPrimary: colors.primary,
      colorBackground: colors.background,
      colorText: colors.text,
      colorTextSecondary: colors.muted,
      colorTextPlaceholder: colors.muted,
      colorDanger: danger,
      accessibleColorOnColorPrimary: colors.primaryContrast,
      iconColor: colors.muted,
      fontFamily: fontStack(fonts.body, {}),
      fontSizeBase: '16px',
      fontWeightMedium: '600',
      borderRadius: '3px',
      spacingUnit: '4px',
      focusBoxShadow: focusRing,
      focusOutline: 'none',
    },
    rules: {
      '.Input': { border: `1px solid ${inputBorder}`, boxShadow: 'none' },
      '.Input:focus': { borderColor: colors.primary, boxShadow: focusRing },
      '.Input--invalid': { borderColor: danger, boxShadow: `0 0 0 1px ${danger}` },
      '.Label': { color: colors.text, fontWeight: '600' },
      '.Tab': { border: `1px solid ${inputBorder}`, boxShadow: 'none' },
      '.Tab--selected': { borderColor: colors.primary, boxShadow: `0 0 0 1px ${colors.primary}` },
      '.Error': { color: danger },
    },
  }
}

export type AppearancePair = { label: string; foreground: string; background: string; min: number }

/** The colour pairs the Payment Element draws, each with the contrast it needs (WCAG 2 AA). */
export function appearancePairs(appearance: Appearance): AppearancePair[] {
  const v = appearance.variables ?? {}
  const border = String(appearance.rules?.['.Input']?.border ?? '').replace(/^1px solid /, '')
  const pair = (label: string, foreground: string | undefined, background: string | undefined, min = MIN_TEXT_CONTRAST) => ({
    label,
    foreground: foreground ?? '',
    background: background ?? '',
    min,
  })
  return [
    pair('text on background', v.colorText, v.colorBackground),
    pair('secondary text on background', v.colorTextSecondary, v.colorBackground),
    pair('placeholder on background', v.colorTextPlaceholder, v.colorBackground),
    pair('danger on background', v.colorDanger, v.colorBackground),
    pair('primary on background', v.colorPrimary, v.colorBackground),
    pair('text on primary', v.accessibleColorOnColorPrimary, v.colorPrimary),
    pair('input border on background', border, v.colorBackground, MIN_BORDER_CONTRAST),
  ]
}
