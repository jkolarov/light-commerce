import type { Block } from 'payload'

import { linkField } from '../../fields/link'
import { requiredInDefaultLocale } from '../../fields/requiredInDefaultLocale'

// A short invitation with one button: a heading, a sentence and a link.
export const callToActionBlock: Block = {
  slug: 'callToAction',
  interfaceName: 'CallToActionBlock',
  labels: { singular: { en: 'Call to action', fr: 'Appel à l’action' }, plural: { en: 'Calls to action', fr: 'Appels à l’action' } },
  fields: [
    { name: 'heading', type: 'text', label: { en: 'Heading', fr: 'Titre' }, localized: true, validate: requiredInDefaultLocale },
    {
      name: 'text',
      type: 'textarea',
      label: { en: 'Text', fr: 'Texte' },
      localized: true,
      admin: { description: { en: 'Optional. One sentence.', fr: 'Facultatif. Une phrase.' } },
    },
    linkField('link'),
  ],
}
