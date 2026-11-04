import { existsSync, readFileSync } from 'node:fs'
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

  it('loads font files that exist, each family with its licence', () => {
    const files = [...source.matchAll(/path: '([^']+)'/g)].map((match) => match[1] ?? '')
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(existsSync(path.join(dir, file)), file).toBe(true)
      expect(existsSync(path.join(dir, path.dirname(file), 'OFL.txt')), `${path.dirname(file)}/OFL.txt`).toBe(true)
    }
  })

  it('loads every shipped family', () => {
    const loadedNames = source.slice(source.indexOf('export const loadedFonts')).match(/^\s+(?:'([^']+)'|(\w+)):/gm) ?? []
    const names = loadedNames.map((line) => line.trim().replace(/:$/, '').replace(/^'|'$/g, ''))
    expect(names.sort()).toEqual(shippedFamilies.map((family) => family.name).sort())
  })
})
