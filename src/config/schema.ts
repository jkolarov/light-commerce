import type { Locale } from '@/core/i18n/locales'

// Placeholder for the shape of light.config.ts (plan, Shared contracts). S03 replaces this file
// with the zod schema `lightConfigSchema`, `type LightConfig` and `type LightConfigInput`.
export type LightConfig = {
  site: { name: string; url: string; indexable: boolean; contactEmail: string }
  locales: { available: Locale[]; default: Locale }
  modules: { cms: boolean; shop: boolean }
  theme: {
    colors: {
      primary: string
      primaryContrast: string
      background: string
      surface: string
      text: string
      muted: string
    }
    fonts: { heading: string; body: string }
    logo: string
  }
  email: { fromName: string; fromAddress: string; ownerNotificationsTo: string }
  shop?: {
    currency: 'EUR'
    pricesIncludeTax: true
    displayTaxRate: number
    shipping: { flatRate: number; countries: string[] }
  }
}
