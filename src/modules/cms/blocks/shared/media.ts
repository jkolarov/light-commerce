import type { Media } from '@/payload-types'

export type ImageSource = { url: string; width: number; height: number }

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
