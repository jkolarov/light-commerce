import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { getLightConfig } from '@/config'
import { Logo } from '@/theme/layout/Logo'
import { logoImage } from '@/theme/logo'

import { render } from './render'

describe('logoImage', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lc-logo-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it("reads the size of the repo's logo from its viewBox", async () => {
    const { logo } = getLightConfig().theme
    expect(await logoImage(logo)).toEqual({ src: logo, width: 579, height: 106 })
  })

  it('reads it once per file', () => {
    writeFileSync(path.join(dir, 'mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"/>')
    const first = logoImage('/mark.svg', dir)
    expect(logoImage('/mark.svg', dir)).toBe(first)
    return expect(first).resolves.toEqual({ src: '/mark.svg', width: 40, height: 20 })
  })

  it('draws the logo without a size when the file cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await logoImage('/missing.svg', dir)).toEqual({ src: '/missing.svg' })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('Logo', () => {
  const image = { src: '/logo.svg', width: 579, height: 106 }

  it('reserves its space, and the header logo loads first', () => {
    const html = render(<Logo locale="fr" image={image} siteName="Les Claies" priority className="h-7" />)
    expect(html).toMatch(/<img src="\/logo.svg" alt="Les Claies" width="579" height="106" fetchPriority="high" decoding="async" class="block w-auto h-7"\/>/)
  })

  it('lets the footer logo load lazily', () => {
    const html = render(<Logo locale="fr" image={image} siteName="Les Claies" />)
    expect(html).toContain('loading="lazy"')
    expect(html).not.toContain('fetchPriority')
  })

  it('has no size attributes when the size is unknown', () => {
    const html = render(<Logo locale="fr" image={{ src: '/logo.png' }} siteName="Les Claies" />)
    expect(html).not.toMatch(/width=|height=/)
  })
})
