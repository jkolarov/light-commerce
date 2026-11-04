import type { Block } from 'payload'

import { requiredInDefaultLocale } from '../../fields/requiredInDefaultLocale'
import { optionalLinkField } from '../shared/optionalLinkField'

// The top of a page: its visible title (the page's only h1), a line or two of text, a wide photo
// and at most one button.
export const heroBlock: Block = {
  slug: 'hero',
  interfaceName: 'HeroBlock',
  labels: { singular: { en: 'Hero', fr: 'Bandeau d’accueil' }, plural: { en: 'Heroes', fr: 'Bandeaux d’accueil' } },
  fields: [
    {
      name: 'heading',
      type: 'text',
      label: { en: 'Heading', fr: 'Titre' },
      localized: true,
      validate: requiredInDefaultLocale,
      admin: { description: { en: 'The title of the page, as visitors see it. One sentence at most.', fr: 'Le titre de la page, tel que les visiteurs le voient. Une phrase au plus.' } },
    },
    {
      name: 'text',
      type: 'textarea',
      label: { en: 'Text', fr: 'Texte' },
      localized: true,
      admin: { description: { en: 'Optional. One or two sentences under the title.', fr: 'Facultatif. Une ou deux phrases sous le titre.' } },
    },
    {
      name: 'image',
      type: 'upload',
      label: { en: 'Image', fr: 'Image' },
      relationTo: 'media',
      required: true,
      admin: { description: { en: 'A wide photo (landscape, 16:10 works best).', fr: 'Une photo large (paysage, le format 16:10 convient le mieux).' } },
    },
    optionalLinkField('link'),
  ],
}
