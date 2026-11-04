import { afterEach, expect, it, vi } from 'vitest'

import en from '../messages/en.json'
import fr from '../messages/fr.json'

// next-intl's server helpers need a request; read the real message files instead.
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'fr' | 'en'; namespace: 'home' }) => {
    const messages = { fr, en }[locale][namespace]
    return (key: keyof typeof messages) => messages[key]
  },
}))

// The home page with the CMS off has a title and a description (the shop's list is the home).

const previous = process.env.LIGHT_CI_MODULES
afterEach(() => {
  if (previous === undefined) delete process.env.LIGHT_CI_MODULES
  else process.env.LIGHT_CI_MODULES = previous
})

it.each([
  ['fr', 'Découvrez nos produits.'],
  ['en', 'Browse our products.'],
])('has the site name and a description in %s with the CMS off', async (locale, description) => {
  process.env.LIGHT_CI_MODULES = 'shop'
  const { generateMetadata } = await import('@/app/(frontend)/[locale]/page')
  const meta = await generateMetadata({ params: Promise.resolve({ locale }) })
  expect(meta.title).toEqual({ absolute: 'Les Claies' })
  expect(meta.description).toBe(description)
})
