// The font families the theme ships, and how a `theme.fonts` value from light.config.ts becomes a
// CSS font stack. Pure data and functions: the files are loaded in ./index.ts (next/font), which
// only the locale layout imports. To add a font, follow the steps at the top of ./index.ts.

export type ShippedFamily = {
  /** The family name light.config.ts uses, like 'Spectral'. Matched without case or quotes. */
  name: string
  /** What the browser uses until the font has loaded, or for characters it lacks. */
  fallback: string
}

export const shippedFamilies: readonly ShippedFamily[] = [
  { name: 'Spectral', fallback: "Georgia, 'Times New Roman', serif" },
  { name: 'Source Sans 3', fallback: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
]

/** `style.fontFamily` of each loaded font (next/font), by family name. */
export type LoadedFonts = Readonly<Record<string, string>>

/** After a font the theme does not ship: the system's sans-serif. */
const DEFAULT_FALLBACK = "system-ui, -apple-system, 'Segoe UI', sans-serif"

const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
])

const unquote = (family: string) => family.replace(/^(['"])(.*)\1$/, '$2').trim()

/** Generic families and keywords stay bare; a name gets double quotes ("Source Sans 3" must). */
function cssFamily(family: string): string {
  if (/^['"]/.test(family) || GENERIC.has(family.toLowerCase())) return family
  return family.includes('"') ? family : `"${family}"`
}

function families(value: string): string[] {
  return value
    .split(',')
    .map((family) => family.trim())
    .filter(Boolean)
}

function shipped(name: string): ShippedFamily | undefined {
  const wanted = unquote(name).toLowerCase()
  return shippedFamilies.find((family) => family.name.toLowerCase() === wanted)
}

/**
 * The CSS font stack for a `theme.fonts` value. A shipped first family is replaced by the loaded
 * font, followed by the config's own fallbacks or the family's. Any other value is used as a
 * stack (names quoted), with the system's sans-serif added when it names no generic family.
 * The schema allows only letters, digits, spaces, commas, quotes, `_` and `-` in these values,
 * so the result is safe in a style attribute.
 */
export function fontStack(value: string, loaded: LoadedFonts): string {
  const [first = '', ...rest] = families(value)
  const family = shipped(first)
  const loadedFamily = family && loaded[family.name]
  if (family && loadedFamily) {
    return [loadedFamily, rest.length > 0 ? rest.map(cssFamily).join(', ') : family.fallback].join(', ')
  }
  const stack = families(value).map(cssFamily)
  const hasGeneric = stack.some((name) => GENERIC.has(unquote(name).toLowerCase()))
  return hasGeneric ? stack.join(', ') : [...stack, DEFAULT_FALLBACK].join(', ')
}

/**
 * Why a `theme.fonts` value would not show as written, or `null` when it is fine: its first family
 * is shipped, or it is a stack that ends in a generic family ("Georgia, serif"), so the author
 * chose the system fonts on purpose. A typo ("Spectal") would otherwise fall back silently.
 */
export function fontProblem(value: string): string | null {
  const list = families(value)
  if (shipped(list[0] ?? '')) return null
  const last = unquote(list.at(-1) ?? '').toLowerCase()
  if (GENERIC.has(last)) return null
  return (
    `${JSON.stringify(unquote(list[0] ?? value))} is not one of the fonts the theme ships ` +
    `(${shippedFamilies.map((family) => family.name).join(', ')}). Add it (see src/theme/fonts/index.ts), ` +
    'or write a system stack that ends in a generic family, like "Georgia, serif".'
  )
}
