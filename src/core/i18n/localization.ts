import type { LocalizationConfig } from 'payload'

import type { LightConfig } from '@/config/schema'

import type { Locale } from './locales'

const labels: Record<Locale, string> = { fr: 'Français', en: 'English' }

// Payload content localization, from `locales` in light.config.ts. A missing translation falls
// back to the default locale, never a blank page.
export function localizationConfig({ config }: { config: LightConfig }): LocalizationConfig {
  const { available, default: defaultLocale } = config.locales
  return {
    locales: available.map((code) => ({ code, label: labels[code] })),
    defaultLocale,
    fallback: true,
  }
}
