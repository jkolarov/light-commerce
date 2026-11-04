import type { LightConfig } from './schema'

export type { LightConfig } from './schema'

// Placeholder values until S03 adds light.config.ts at the repo root, `defineLightConfig` and
// validation. Both modules are on.
const placeholderConfig: LightConfig = {
  site: {
    name: 'light-commerce',
    url: 'http://localhost:3000',
    indexable: false,
    contactEmail: 'contact@example.com',
  },
  locales: { available: ['fr', 'en'], default: 'fr' },
  modules: { cms: true, shop: true },
  theme: {
    colors: {
      primary: '#1f3a5f',
      primaryContrast: '#ffffff',
      background: '#ffffff',
      surface: '#f4f4f2',
      text: '#1c1c1a',
      muted: '#5f5f5a',
    },
    fonts: {
      heading: 'system-ui, sans-serif',
      body: 'system-ui, sans-serif',
    },
    logo: '/logo.svg',
  },
  email: {
    fromName: 'light-commerce',
    fromAddress: 'no-reply@example.com',
    ownerNotificationsTo: 'owner@example.com',
  },
  shop: {
    currency: 'EUR',
    pricesIncludeTax: true,
    displayTaxRate: 20,
    shipping: { flatRate: 490, countries: ['FR'] },
  },
}

/** The site's settings. S03 returns the validated light.config.ts instead. */
export function getLightConfig(): LightConfig {
  return placeholderConfig
}
