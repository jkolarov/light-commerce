// The site's settings: the one file to edit for anything that changes rarely. It is checked when
// the app starts, builds and runs its tests: a mistake fails all three with a message that names
// the setting. The shape and the accepted values are in src/config/schema.ts.
//
// These values describe the demo site, Les Claies (demo/brand.md, demo/README.md).
import { defineLightConfig } from './src/config'

export default defineLightConfig({
  site: {
    name: 'Les Claies',
    url: 'https://lightcommerce.fluxory.dev',
    // The demo stays out of search engines.
    indexable: false,
    contactEmail: 'bonjour@lesclaies.example',
  },
  locales: { available: ['fr', 'en'], default: 'fr' },
  modules: { cms: true, shop: true },
  theme: {
    colors: {
      primary: '#7A3B6E',
      primaryContrast: '#FFFFFF',
      background: '#F0F2EA',
      surface: '#E0E6D5',
      text: '#1E2A20',
      muted: '#52604F',
    },
    // Fonts the theme ships, and how to add one: src/theme/fonts/index.ts. A system stack
    // ending in a generic family ("Georgia, serif") also works.
    fonts: { heading: 'Spectral', body: 'Source Sans 3' },
    // public/logo.svg
    logo: '/logo.svg',
  },
  email: {
    fromName: 'Les Claies',
    fromAddress: 'bonjour@lesclaies.example',
    ownerNotificationsTo: 'bonjour@lesclaies.example',
  },
  shop: {
    currency: 'EUR',
    pricesIncludeTax: true,
    // Herbal teas are food in France: reduced VAT rate.
    displayTaxRate: 5.5,
    // 4.90 € per order, mainland France and Corsica.
    shipping: { flatRate: 490, countries: ['FR'] },
  },
})
