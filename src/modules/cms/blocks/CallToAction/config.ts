import type { Block } from 'payload'

import { linkField } from '../../fields/link'
import { requiredInDefaultLocale } from '../../fields/requiredInDefaultLocale'

// A short invitation with one button: a heading, a sentence and a link.
export const callToActionBlock: Block = {
  slug: 'callToAction',
  interfaceName: 'CallToActionBlock',
  labels: { singular: 'Call to action', plural: 'Calls to action' },
  fields: [
    { name: 'heading', type: 'text', localized: true, validate: requiredInDefaultLocale },
    {
      name: 'text',
      type: 'textarea',
      localized: true,
      admin: { description: 'Optional. One sentence.' },
    },
    linkField('link'),
  ],
}
