import type { LocalizationConfig } from 'payload'

// Payload content localization. A missing translation falls back to the default locale,
// never a blank page. Hardcoded until S06 reads the locales from light.config.ts.
export const localization: LocalizationConfig = {
  locales: [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
  ],
  defaultLocale: 'fr',
  fallback: true,
}
