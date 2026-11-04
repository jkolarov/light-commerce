import { describe, expect, it } from 'vitest'

import type { LightConfig } from '@/config/schema'
import { localizationConfig } from '@/core/i18n/localization'

const config = (available: ('fr' | 'en')[], def: 'fr' | 'en') =>
  ({ locales: { available, default: def } }) as LightConfig

describe('localizationConfig', () => {
  it('follows light.config.ts and keeps the fallback on', () => {
    expect(localizationConfig({ config: config(['en', 'fr'], 'en') })).toEqual({
      locales: [
        { code: 'en', label: 'English' },
        { code: 'fr', label: 'Français' },
      ],
      defaultLocale: 'en',
      fallback: true,
    })
  })

  it('supports a single-locale site', () => {
    const result = localizationConfig({ config: config(['fr'], 'fr') })
    expect(result).toMatchObject({ locales: [{ code: 'fr' }], defaultLocale: 'fr', fallback: true })
  })
})
