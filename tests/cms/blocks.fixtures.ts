// Builders for Lexical rich text and media, shaped like what Payload stores and returns.
// Used by the block tests; not a test file itself.

import type { Media, RichTextBlock } from '@/payload-types'

type Node = Record<string, unknown>
const element = { direction: null, format: '', indent: 0, version: 1 }

export const text = (value: string, format = 0): Node => ({
  type: 'text',
  text: value,
  format,
  detail: 0,
  mode: 'normal',
  style: '',
  version: 1,
})
export const BOLD = 1
export const ITALIC = 2

export const linebreak = (): Node => ({ type: 'linebreak', version: 1 })
export const paragraph = (...children: Node[]): Node => ({ type: 'paragraph', children, textFormat: 0, textStyle: '', ...element })
export const heading = (tag: 'h1' | 'h2' | 'h3' | 'h4', value: string): Node => ({ type: 'heading', tag, children: [text(value)], ...element })
export const list = (tag: 'ul' | 'ol', items: Node[][]): Node => ({
  type: 'list',
  tag,
  listType: tag === 'ol' ? 'number' : 'bullet',
  start: 1,
  children: items.map((children, index) => ({ type: 'listitem', value: index + 1, children, ...element })),
  ...element,
})
export const quote = (...children: Node[]): Node => ({ type: 'quote', children, ...element })

/** An internal link: `page` is the populated page (as Payload returns it at depth 1) or its id. */
export const pageLink = (label: string, page: unknown): Node => ({
  type: 'link',
  fields: { linkType: 'internal', doc: { relationTo: 'pages', value: page }, newTab: false },
  children: [text(label)],
  ...element,
})
export const urlLink = (label: string, url: string, newTab = false): Node => ({
  type: 'link',
  fields: { linkType: 'custom', url, newTab },
  children: [text(label)],
  ...element,
})

export const richText = (...children: Node[]) =>
  ({ root: { type: 'root', children, ...element } }) as unknown as NonNullable<RichTextBlock['content']>

const variant = (width: number, height: number) => ({
  url: `/api/media/file/farm-${width}x${height}.webp`,
  width,
  height,
  mimeType: 'image/webp',
  filename: `farm-${width}x${height}.webp`,
})

/** A landscape photo with the four variants the media collection makes. */
export const landscape: Media = {
  id: 1,
  alt: 'Des mains tiennent un bouquet de fleurs',
  url: '/api/media/file/farm.jpg',
  filename: 'farm.jpg',
  mimeType: 'image/jpeg',
  width: 2000,
  height: 1250,
  updatedAt: '2026-11-04T00:00:00.000Z',
  createdAt: '2026-11-04T00:00:00.000Z',
  variants: {
    thumbnail: variant(400, 250),
    card: variant(800, 500),
    hero: variant(1920, 1200),
    og: variant(1200, 630),
  },
}

/** A photo smaller than every variant: Payload keeps its size for each one, nothing is upscaled. */
export const small: Media = {
  ...landscape,
  id: 2,
  url: '/api/media/file/small.png',
  width: 300,
  height: 200,
  variants: {
    thumbnail: { url: '/api/media/file/small-300x200.webp', width: 300, height: 200 },
    card: { url: '/api/media/file/small-300x200.webp', width: 300, height: 200 },
    hero: { url: '/api/media/file/small-300x200.webp', width: 300, height: 200 },
    og: { url: '/api/media/file/small-300x200-og.webp', width: 300, height: 200 },
  },
}

export const publishedPage = (slug: string) => ({ id: 10, _status: 'published', slug })
export const draftPage = (slug: string) => ({ id: 11, _status: 'draft', slug })
