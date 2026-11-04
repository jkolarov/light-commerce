import { expect, it } from 'vitest'

import { pageTitle, titleText, withSiteName } from '@/theme/title'

// The site name appears once: the layout template adds it, unless the title already has it.

it('leaves a plain title to the layout template', () => {
  expect(pageTitle('Nos tisanes', 'Les Claies')).toBe('Nos tisanes')
})

it('uses a title that ends with the site name as-is', () => {
  expect(pageTitle('Nos tisanes – Les Claies', 'Les Claies')).toEqual({ absolute: 'Nos tisanes – Les Claies' })
  expect(titleText(pageTitle('Nos tisanes – les claies ', 'Les Claies'))).toBe('Nos tisanes – les claies')
})

it('uses a title that starts with, contains or is the site name as-is', () => {
  expect(pageTitle('Les Claies – plantes à tisane des Baronnies', 'Les Claies')).toEqual({ absolute: 'Les Claies – plantes à tisane des Baronnies' })
  expect(pageTitle('Les Claies et vous', 'Les Claies')).toEqual({ absolute: 'Les Claies et vous' })
  expect(pageTitle('Les Claies', 'Les Claies')).toEqual({ absolute: 'Les Claies' })
  expect(pageTitle('Bienvenue aux LES CLAIES, ici', 'Les Claies')).toEqual({ absolute: 'Bienvenue aux LES CLAIES, ici' })
})

it('has no title for empty text', () => {
  expect(pageTitle('  ', 'Les Claies')).toBeUndefined()
  expect(pageTitle(null, 'Les Claies')).toBeUndefined()
})

it('adds the site name to a home page title once, and leaves absolute titles alone', () => {
  expect(withSiteName('Accueil', 'Les Claies')).toEqual({ absolute: 'Accueil – Les Claies' })
  expect(withSiteName({ absolute: 'Accueil – Les Claies' }, 'Les Claies')).toEqual({ absolute: 'Accueil – Les Claies' })
  expect(withSiteName(undefined, 'Les Claies')).toBeUndefined()
})
