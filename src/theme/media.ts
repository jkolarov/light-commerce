import type { Media } from '@/payload-types'

// Photos from the media collection, for any part of the public site: the CMS blocks and the shop's
// pages both draw them through these helpers and `MediaImage`.

export type ImageSource = { url: string; width: number; height: number }

/** Plain `<img>` attributes, so a client component can draw the photo too. */
export type ImageAttributes = {
  src: string
  srcSet?: string
  sizes?: string
  width?: number
  height?: number
  alt: string
}

// The media variants that keep the photo's shape (see `mediaSharp` in core). `og` is a 1200x630
// crop for share previews and never goes in a srcset.
const WIDTH_VARIANTS = ['thumbnail', 'card', 'hero'] as const

/** The media document when the relation was loaded (depth 1), otherwise null (an id, deleted, empty). */
export function asMedia(value: unknown): Media | null {
  if (!value || typeof value !== 'object') return null
  const media = value as Media
  return typeof media.url === 'string' && media.url ? media : null
}

/**
 * The sources for an `<img srcset>`: one per width, smallest first. A photo smaller than a variant
 * keeps its own size for that variant (nothing is upscaled), so widths repeat and are dropped here.
 * Without variants (an SVG, or an upload made before them) the original is the only source.
 */
export function imageSources(media: Media): ImageSource[] {
  const byWidth = new Map<number, ImageSource>()
  for (const name of WIDTH_VARIANTS) {
    const variant = media.variants?.[name]
    if (variant?.url && variant.width && variant.height && !byWidth.has(variant.width)) {
      byWidth.set(variant.width, { url: variant.url, width: variant.width, height: variant.height })
    }
  }
  if (!byWidth.size && media.url && media.width && media.height) {
    byWidth.set(media.width, { url: media.url, width: media.width, height: media.height })
  }
  return [...byWidth.values()].sort((a, b) => a.width - b.width)
}

/**
 * The `<img>` attributes for a photo: its variants in `srcset`, `sizes` (how wide it is drawn, so
 * the browser picks a variant), the largest variant's width and height against layout shift, and
 * its alt text in the language it was read in.
 */
export function imageAttributes(media: Media, sizes: string): ImageAttributes {
  const sources = imageSources(media)
  const largest = sources.at(-1)
  const several = sources.length > 1
  return {
    src: largest?.url ?? media.url ?? '',
    srcSet: several ? sources.map((s) => `${s.url} ${s.width}w`).join(', ') : undefined,
    sizes: several ? sizes : undefined,
    width: largest?.width ?? media.width ?? undefined,
    height: largest?.height ?? media.height ?? undefined,
    alt: media.alt ?? '',
  }
}

/** A small square-ish preview: the `thumbnail` variant (400 px wide), or the original without it. */
export function thumbnailAttributes(media: Media): ImageAttributes {
  const thumbnail = media.variants?.thumbnail
  const small = thumbnail?.url && thumbnail.width && thumbnail.height ? thumbnail : null
  return {
    src: small?.url ?? media.url ?? '',
    width: (small?.width ?? media.width) || undefined,
    height: (small?.height ?? media.height) || undefined,
    alt: media.alt ?? '',
  }
}

/** A share-preview image, its address site-relative. */
export type ShareImage = { url: string; width?: number; height?: number; alt: string }

/** The `og` variant (1200x630) for share previews, or the original when the photo was too small for it. */
export function shareImage(media: Media): ShareImage | undefined {
  const og = media.variants?.og
  if (og?.url) return { url: og.url, width: og.width ?? undefined, height: og.height ?? undefined, alt: media.alt ?? '' }
  return media.url ? { url: media.url, width: media.width ?? undefined, height: media.height ?? undefined, alt: media.alt ?? '' } : undefined
}
