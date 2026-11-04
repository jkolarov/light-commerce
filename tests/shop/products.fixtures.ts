// Products and photos shaped like a visitor's read at depth 1 (photos loaded), for the shop's
// view tests. Not a test file itself.

import type { Media, Product } from '@/payload-types'

type Node = Record<string, unknown>
const element = { direction: null, format: '', indent: 0, version: 1 }

export const text = (value: string): Node => ({ type: 'text', text: value, format: 0, detail: 0, mode: 'normal', style: '', version: 1 })
export const paragraph = (...children: Node[]): Node => ({ type: 'paragraph', children, textFormat: 0, textStyle: '', ...element })
export const heading = (tag: 'h1' | 'h2' | 'h3', value: string): Node => ({ type: 'heading', tag, children: [text(value)], ...element })
export const urlLink = (label: string, url: string): Node => ({
  type: 'link',
  fields: { linkType: 'custom', url, newTab: false },
  children: [text(label)],
  ...element,
})
export const internalLink = (label: string, relationTo: string, value: unknown): Node => ({
  type: 'link',
  fields: { linkType: 'internal', doc: { relationTo, value }, newTab: false },
  children: [text(label)],
  ...element,
})
export const richText = (...children: Node[]) =>
  ({ root: { type: 'root', children, ...element } }) as unknown as NonNullable<Product['description']>

const variant = (name: string, width: number, height: number) => ({
  url: `/api/media/file/${name}-${width}x${height}.webp`,
  width,
  height,
  mimeType: 'image/webp',
  filename: `${name}-${width}x${height}.webp`,
})

let nextId = 100

/** A square 1200 px product photo with the four variants the media collection makes. */
export const squarePhoto = (name: string, alt: string): Media => ({
  id: nextId++,
  alt,
  url: `/api/media/file/${name}.jpg`,
  filename: `${name}.jpg`,
  mimeType: 'image/jpeg',
  width: 1200,
  height: 1200,
  variants: {
    thumbnail: variant(name, 400, 400),
    card: variant(name, 800, 800),
    hero: variant(name, 1200, 1200),
    og: variant(name, 1200, 630),
  },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
})

/** La Verveine, published, 7.90 €, 48 in stock, one photo. */
export const product = (overrides: Partial<Product> = {}): Product => ({
  id: 1,
  title: 'Verveine odorante',
  slug: 'verveine-odorante',
  summary: 'Citronnée et vive, feuilles entières',
  description: richText(paragraph(text('La verveine odorante est la plante qui a lancé la ferme.'))),
  images: [squarePhoto('verveine', 'Pieds de verveine odorante en été')],
  facts: [
    { id: 'f1', label: 'Plante', value: 'Aloysia citrodora, feuilles' },
    { id: 'f2', label: 'Poids net', value: '30 g, environ 25 tasses' },
  ],
  inventory: 48,
  priceInEUREnabled: true,
  priceInEUR: 790,
  _status: 'published',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  ...overrides,
})
