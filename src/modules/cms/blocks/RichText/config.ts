import type { Block } from 'payload'

import { blockRichTextField } from '../shared/richTextField'

// Running text: paragraphs, headings, lists, quotes and links.
export const richTextBlock: Block = {
  slug: 'richText',
  interfaceName: 'RichTextBlock',
  labels: { singular: 'Rich text', plural: 'Rich texts' },
  fields: [blockRichTextField('content')],
}
