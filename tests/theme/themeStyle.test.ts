import { describe, expect, it } from 'vitest'

import { getLightConfig } from '@/config'
import { themeStyle } from '@/theme/themeStyle'

const loaded = { Spectral: "'spectral'", 'Source Sans 3': "'sourceSans3'" }

describe('themeStyle', () => {
  it('sets every --lc-* variable from the theme in light.config.ts', () => {
    const { theme } = getLightConfig()
    expect(themeStyle(theme, loaded)).toEqual({
      '--lc-color-primary': theme.colors.primary,
      '--lc-color-primary-contrast': theme.colors.primaryContrast,
      '--lc-color-background': theme.colors.background,
      '--lc-color-surface': theme.colors.surface,
      '--lc-color-text': theme.colors.text,
      '--lc-color-muted': theme.colors.muted,
      '--lc-font-heading': expect.stringMatching(/^'spectral', Georgia/),
      '--lc-font-body': expect.stringMatching(/^'sourceSans3', system-ui/),
    })
  })

  it('follows another business’s colours and fonts', () => {
    const theme = {
      colors: {
        primary: 'rgb(10 60 120)',
        primaryContrast: '#fff',
        background: '#ffffff',
        surface: '#f2f2f2',
        text: '#111111',
        muted: '#555555',
      },
      fonts: { heading: 'Georgia, serif', body: 'system-ui, sans-serif' },
      logo: '/logo.svg',
    }
    const style = themeStyle(theme, loaded)
    expect(style['--lc-color-primary']).toBe('rgb(10 60 120)')
    expect(style['--lc-font-heading']).toBe('"Georgia", serif')
    expect(style['--lc-font-body']).toBe('system-ui, sans-serif')
  })
})
