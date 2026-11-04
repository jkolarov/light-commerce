import type { LightConfig } from '@/config'

// WCAG 2 contrast for the theme's colours, used by the test that guards light.config.ts
// (tests/theme/contrast.test.ts). Reads hex and rgb() colours. The schema also accepts hsl(),
// oklch() and other CSS colour functions: to check those, add a parser below (convert to sRGB
// 0-255), or write the colour as hex in light.config.ts.

export type Rgba = { r: number; g: number; b: number; a: number }

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB = /^rgba?\(\s*([^)]*)\)$/i

function channel(value: string, scale: number): number {
  const n = value.endsWith('%') ? (Number.parseFloat(value) / 100) * scale : Number.parseFloat(value)
  if (!Number.isFinite(n)) throw new Error(`not a number: ${JSON.stringify(value)}`)
  return Math.min(scale, Math.max(0, n))
}

/** A hex or rgb() colour as 0-255 channels and an alpha from 0 to 1. Throws on anything else. */
export function parseColour(value: string): Rgba {
  const colour = value.trim()
  const hex = HEX.exec(colour)?.[1]
  if (hex) {
    const digits = hex.length <= 4 ? [...hex].map((d) => d + d) : (hex.match(/../g) ?? [])
    const [r = 0, g = 0, b = 0, a = 255] = digits.map((pair) => Number.parseInt(pair, 16))
    return { r, g, b, a: a / 255 }
  }
  const rgb = RGB.exec(colour)?.[1]
  if (rgb) {
    // `rgb(r g b / a)` or the legacy `rgba(r, g, b, a)`.
    const [channels = '', slashAlpha] = rgb.split('/')
    const parts = channels.split(/[\s,]+/).filter(Boolean)
    const alpha = slashAlpha?.trim() ?? (parts.length === 4 ? parts.pop() : undefined)
    if (parts.length !== 3) throw new Error(`cannot read the colour ${JSON.stringify(value)}`)
    const [r = 0, g = 0, b = 0] = parts.map((part) => channel(part, 255))
    return { r, g, b, a: alpha === undefined ? 1 : channel(alpha, 1) }
  }
  throw new Error(
    `cannot check the contrast of ${JSON.stringify(value)}: only hex or rgb() colours are read. ` +
      'Write it as hex in light.config.ts, or add its format to src/theme/contrast.ts.',
  )
}

/** Lays a colour with alpha over an opaque one. */
function over(top: Rgba, below: Rgba): Rgba {
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a)
  return { r: mix(top.r, below.r), g: mix(top.g, below.g), b: mix(top.b, below.b), a: 1 }
}

/** WCAG 2 relative luminance of an opaque sRGB colour. */
function luminance({ r, g, b }: Rgba): number {
  const linear = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

/**
 * WCAG 2 contrast ratio of a text colour on a background, from 1 to 21. A see-through background
 * is laid over white (the browser's canvas), then a see-through text colour over the background.
 */
export function contrastRatio(foreground: string, background: string): number {
  const bg = over(parseColour(background), WHITE)
  const fg = over(parseColour(foreground), bg)
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

export type ColourPair = { label: string; foreground: string; background: string }

/** The text and background pairs the theme draws, each of which needs 4.5:1 (WCAG 2 AA). */
export function textPairs(colors: LightConfig['theme']['colors']): ColourPair[] {
  const pair = (fg: keyof typeof colors, bg: keyof typeof colors): ColourPair => ({
    label: `${fg} on ${bg}`,
    foreground: colors[fg],
    background: colors[bg],
  })
  return [
    pair('text', 'background'),
    pair('text', 'surface'),
    pair('muted', 'background'),
    pair('muted', 'surface'),
    pair('primaryContrast', 'primary'),
    // Links and the selected state are drawn in `primary`.
    pair('primary', 'background'),
    pair('primary', 'surface'),
  ]
}
