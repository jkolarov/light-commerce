import type { Block } from 'payload'

import { blockRichTextField } from '../shared/richTextField'

// Running text: paragraphs, headings, lists, quotes and links.
export const richTextBlock: Block = {
  slug: 'richText',
  interfaceName: 'RichTextBlock',
  labels: { singular: { en: 'Rich text', fr: 'Texte riche' }, plural: { en: 'Rich texts', fr: 'Textes riches' } },
  fields: [blockRichTextField('content')],
}
