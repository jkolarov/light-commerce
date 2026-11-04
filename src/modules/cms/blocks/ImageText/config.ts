import type { Block } from 'payload'

import { blockRichTextField } from '../shared/richTextField'

// A photo next to some text. On phones the photo comes first, above the text.
export const imageTextBlock: Block = {
  slug: 'imageText',
  interfaceName: 'ImageTextBlock',
  labels: { singular: 'Image + text', plural: 'Image + text' },
  fields: [
    { name: 'heading', type: 'text', localized: true, admin: { description: 'Optional.' } },
    blockRichTextField('content'),
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: { description: 'A portrait photo (4:5 works best).' },
    },
    {
      name: 'imagePosition',
      type: 'radio',
      required: true,
      defaultValue: 'left',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Right', value: 'right' },
      ],
      admin: { layout: 'horizontal', description: 'Side of the photo on wide screens.' },
    },
    {
      name: 'caption',
      type: 'text',
      localized: true,
      admin: { description: 'Optional. A short line under the photo: a place, a date.' },
    },
  ],
}
