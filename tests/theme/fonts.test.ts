import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { getLightConfig } from '@/config'
import { fontProblem, fontStack, shippedFamilies } from '@/theme/fonts/families'

// Stand-ins for what next/font returns as `style.fontFamily` (a generated name and its fallback).
const loaded = {
  Spectral: "'spectral', 'spectral Fallback'",
  'Source Sans 3': "'sourceSans3', 'sourceSans3 Fallback'",
}

describe('fontStack', () => {
  it('uses the shipped font, then its fallback stack', () => {
    expect(fontStack('Spectral', loaded)).toBe("'spectral', 'spectral Fallback', Georgia, 'Times New Roman', serif")
    expect(fontStack('Source Sans 3', loaded)).toBe(
      "'sourceSans3', 'sourceSans3 Fallback', system-ui, -apple-system, 'Segoe UI', sans-serif",
    )
  })

  it('matches the family name whatever its case or quotes', () => {
    expect(fontStack("'source sans 3'", loaded)).toMatch(/^'sourceSans3'/)
    expect(fontStack('"SPECTRAL"', loaded)).toMatch(/^'spectral'/)
  })

  it("keeps the config's own fallbacks after a shipped font", () => {
    expect(fontStack('Spectral, Garamond, serif', loaded)).toBe("'spectral', 'spectral Fallback', \"Garamond\", serif")
  })

  it('passes a system stack through, quoting names that need it', () => {
    expect(fontStack('system-ui, sans-serif', loaded)).toBe('system-ui, sans-serif')
    expect(fontStack('Georgia, Times New Roman, serif', loaded)).toBe('"Georgia", "Times New Roman", serif')
  })

  it('adds a sans-serif stack after a font it does not ship', () => {
    expect(fontStack('Playfair Display', loaded)).toBe('"Playfair Display", system-ui, -apple-system, \'Segoe UI\', sans-serif')
  })
})

describe('fontProblem', () => {
  it('accepts a shipped font or a stack that ends in a generic family', () => {
    expect(fontProblem('Spectral')).toBeNull()
    expect(fontProblem('Georgia, serif')).toBeNull()
    expect(fontProblem('system-ui, sans-serif')).toBeNull()
  })

  it('names a font that is neither shipped nor a system stack', () => {
    expect(fontProblem('Spectal')).toMatch(/"Spectal" is not one of the fonts the theme ships \(Spectral, Source Sans 3\)/)
    expect(fontProblem('Spectal')).toMatch(/src\/theme\/fonts\/index\.ts/)
  })
})

describe("the repo's light.config.ts", () => {
  const { fonts } = getLightConfig().theme

  it.each(Object.entries(fonts))('the %s font is shipped or a system stack', (_role, value) => {
    expect(fontProblem(value)).toBeNull()
  })

  it('every shipped family has a fallback stack ending in a generic family', () => {
    for (const family of shippedFamilies) expect(family.fallback).toMatch(/(serif|sans-serif|monospace)$/)
  })
})

// src/theme/fonts/index.ts calls next/font, which only runs inside Next's compiler, so it is read as text.
describe('src/theme/fonts/index.ts', () => {
  const dir = path.resolve('src/theme/fonts')
  const source = readFileSync(path.join(dir, 'index.ts'), 'utf8')

  /** Each `const x = localFont({ ... })` call: its name, CSS family, files and whether it is preloaded. */
  const calls = [...source.matchAll(/const (\w+) = localFont\(\{([\s\S]*?)\n\}\)/g)].map(([, name = '', body = '']) => ({
    name,
    family: body.match(/prop: 'font-family', value: '([^']+)'/)?.[1],
    files: [...body.matchAll(/path: '([^']+)'/g)].map((match) => match[1] ?? ''),
    preload: !/preload: false/.test(body),
  }))

  /** Each `loadedFonts` entry: the config's family name and the call it uses. */
  const loaded = [...source.slice(source.indexOf('export const loadedFonts')).matchAll(/^\s+'?([^':]+)'?: (\w+)\.style\.fontFamily/gm)].map(
    ([, configName = '', call = '']) => ({ configName, call }),
  )

  it('loads font files that exist, each family with its licence', () => {
    const files = calls.flatMap((call) => call.files)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(existsSync(path.join(dir, file)), file).toBe(true)
      expect(existsSync(path.join(dir, path.dirname(file), 'OFL.txt')), `${path.dirname(file)}/OFL.txt`).toBe(true)
    }
  })

  it('gives every call a CSS family, with one preloaded call per family', () => {
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call.family, `${call.name} declares no font-family`).toMatch(/^\w+$/)
    const families = [...new Set(calls.map((call) => call.family))]
    for (const family of families) {
      expect(calls.filter((call) => call.family === family && call.preload), `preloaded calls for ${family}`).toHaveLength(1)
    }
  })

  it('maps every shipped family to its preloaded call', () => {
    expect(loaded.map((entry) => entry.configName).sort()).toEqual(shippedFamilies.map((family) => family.name).sort())
    for (const entry of loaded) expect(calls.find((call) => call.name === entry.call)?.preload, entry.call).toBe(true)
  })

  it('preloads at most 80 KB of fonts on every page', () => {
    const bytes = calls
      .filter((call) => call.preload)
      .flatMap((call) => call.files)
      .reduce((sum, file) => sum + statSync(path.join(dir, file)).size, 0)
    // Spectral 300 and 400 and Source Sans 3 (normal) are about 71 KB. Italics and rare weights
    // go in a `preload: false` call.
    expect(bytes).toBeLessThanOrEqual(80 * 1024)
  })
})
