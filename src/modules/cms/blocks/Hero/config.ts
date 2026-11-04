import type { Block } from 'payload'

import { requiredInDefaultLocale } from '../../fields/requiredInDefaultLocale'
import { optionalLinkField } from '../shared/optionalLinkField'

// The top of a page: its visible title (the page's only h1), a line or two of text, a wide photo
// and at most one button.
export const heroBlock: Block = {
  slug: 'hero',
  interfaceName: 'HeroBlock',
  labels: { singular: 'Hero', plural: 'Heroes' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      localized: true,
      validate: requiredInDefaultLocale,
      admin: { description: 'The title of the page, as visitors see it. One sentence at most.' },
    },
    {
      name: 'text',
      type: 'textarea',
      localized: true,
      admin: { description: 'Optional. One or two sentences under the title.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: { description: 'A wide photo (landscape, 16:10 works best).' },
    },
    optionalLinkField('link'),
  ],
}
