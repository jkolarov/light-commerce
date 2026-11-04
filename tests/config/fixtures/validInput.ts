import type { LightConfigInput } from '@/config'

/** A complete, valid `light.config.ts` input with neutral values. A fresh copy on every call. */
export function validInput(): LightConfigInput {
  return {
    site: {
      name: 'Example shop',
      url: 'https://shop.example.com',
      indexable: true,
      contactEmail: 'hello@example.com',
    },
    locales: { available: ['fr', 'en'], default: 'fr' },
    modules: { cms: true, shop: true },
    theme: {
      colors: {
        primary: '#1f3a5f',
        primaryContrast: '#fff',
        background: 'rgb(255 255 255)',
        surface: 'hsl(60 10% 95%)',
        text: '#1c1c1aff',
        muted: 'oklch(0.5 0.01 100)',
      },
      fonts: { heading: 'Spectral', body: "'Source Sans 3', system-ui, sans-serif" },
      logo: '/logo.svg',
    },
    email: {
      fromName: 'Example shop',
      fromAddress: 'no-reply@example.com',
      ownerNotificationsTo: 'owner@example.com',
    },
    shop: {
      currency: 'EUR',
      pricesIncludeTax: true,
      displayTaxRate: 20,
      shipping: { flatRate: 490, countries: ['FR', 'BE'] },
    },
  }
}
