import { renderToStaticMarkup as html } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Media } from '@/payload-types'
import { MediaImage } from '@/theme'
import { asMedia, imageAttributes, shareImage, thumbnailAttributes } from '@/theme/media'

const variant = (width: number, height: number) => ({ url: `/api/media/file/p-${width}x${height}.webp`, width, height })

const photo: Media = {
  id: 1,
  alt: 'Une photo',
  url: '/api/media/file/p.jpg',
  width: 2400,
  height: 1600,
  variants: { thumbnail: variant(400, 267), card: variant(800, 533), hero: variant(1920, 1280), og: variant(1200, 630) },
  createdAt: '',
  updatedAt: '',
}

/** An upload smaller than every variant: sharp makes none bigger than the original. */
const small: Media = { id: 2, alt: 'Petite', url: '/api/media/file/s.png', width: 300, height: 200, variants: {}, createdAt: '', updatedAt: '' }

describe('theme media helpers', () => {
  it('reads a loaded media document and ignores an id or nothing', () => {
    expect(asMedia(photo)).toBe(photo)
    expect(asMedia(7)).toBeNull()
    expect(asMedia(null)).toBeNull()
    expect(asMedia({ id: 3, url: '' })).toBeNull()
  })

  it('gives an image its width variants in srcset, the largest as src, and its alt text', () => {
    expect(imageAttributes(photo, '50vw')).toEqual({
      src: '/api/media/file/p-1920x1280.webp',
      srcSet: '/api/media/file/p-400x267.webp 400w, /api/media/file/p-800x533.webp 800w, /api/media/file/p-1920x1280.webp 1920w',
      sizes: '50vw',
      width: 1920,
      height: 1280,
      alt: 'Une photo',
    })
  })

  it('falls back to the original when there are no variants', () => {
    expect(imageAttributes(small, '50vw')).toEqual({ src: '/api/media/file/s.png', width: 300, height: 200, alt: 'Petite' })
    expect(thumbnailAttributes(small)).toEqual({ src: '/api/media/file/s.png', width: 300, height: 200, alt: 'Petite' })
    expect(shareImage(small)).toEqual({ url: '/api/media/file/s.png', width: 300, height: 200, alt: 'Petite' })
  })

  it('picks the thumbnail variant for thumbnails and the og crop for share previews', () => {
    expect(thumbnailAttributes(photo)).toEqual({ src: '/api/media/file/p-400x267.webp', width: 400, height: 267, alt: 'Une photo' })
    expect(shareImage(photo)).toEqual({ url: '/api/media/file/p-1200x630.webp', width: 1200, height: 630, alt: 'Une photo' })
  })

  it('MediaImage draws the photo lazily, or eagerly first, and nothing without media', () => {
    const lazy = html(<MediaImage media={photo} sizes="50vw" className="w-full" />)
    expect(lazy).toMatch(/^<img src="\/api\/media\/file\/p-1920x1280\.webp" srcSet="[^"]+" sizes="50vw" width="1920" height="1280" alt="Une photo" loading="lazy" decoding="async" class="w-full"\/>$/)
    expect(html(<MediaImage media={photo} sizes="50vw" priority />)).toContain('fetchPriority="high"')
    expect(html(<MediaImage media={12} sizes="50vw" />)).toBe('')
  })
})
