import type { Block } from 'payload'

import { blockRichTextField } from '../shared/richTextField'

// A photo next to some text. On phones the photo comes first, above the text.
export const imageTextBlock: Block = {
  slug: 'imageText',
  interfaceName: 'ImageTextBlock',
  labels: { singular: { en: 'Image + text', fr: 'Image + texte' }, plural: { en: 'Image + text', fr: 'Image + texte' } },
  fields: [
    { name: 'heading', type: 'text', label: { en: 'Heading', fr: 'Titre' }, localized: true, admin: { description: { en: 'Optional.', fr: 'Facultatif.' } } },
    blockRichTextField('content'),
    {
      name: 'image',
      type: 'upload',
      label: { en: 'Image', fr: 'Image' },
      relationTo: 'media',
      required: true,
      admin: { description: { en: 'A portrait photo (4:5 works best).', fr: 'Une photo en portrait (le format 4:5 convient le mieux).' } },
    },
    {
      name: 'imagePosition',
      type: 'radio',
      label: { en: 'Image position', fr: 'Position de l’image' },
      required: true,
      defaultValue: 'left',
      options: [
        { label: { en: 'Left', fr: 'Gauche' }, value: 'left' },
        { label: { en: 'Right', fr: 'Droite' }, value: 'right' },
      ],
      admin: { layout: 'horizontal', description: { en: 'Side of the photo on wide screens.', fr: 'Côté de la photo sur grand écran.' } },
    },
    {
      name: 'caption',
      type: 'text',
      label: { en: 'Caption', fr: 'Légende' },
      localized: true,
      admin: { description: { en: 'Optional. A short line under the photo: a place, a date.', fr: 'Facultatif. Une courte ligne sous la photo : un lieu, une date.' } },
    },
  ],
}
