import { asMedia, imageAttributes } from '../media'

type Props = {
  /** The upload field's value: the media document at depth 1, or an id when it was not loaded. */
  media: unknown
  /** How wide the image is drawn, for the browser to pick a variant (`sizes` attribute). */
  sizes: string
  className?: string
  /** For the first image on the page: load it straight away. */
  priority?: boolean
}

/**
 * A media photo with its variants in `srcset`, its alt text in the page's language, and its width
 * and height, so the page does not jump when it loads. Nothing when the media is missing.
 */
export function MediaImage({ media, sizes, className, priority = false }: Props) {
  const doc = asMedia(media)
  if (!doc) return null
  return (
    // Plain <img>: the media collection already makes the sizes, next/image would make them again.
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- alt comes from the media document
    <img
      {...imageAttributes(doc, sizes)}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding={priority ? undefined : 'async'}
      className={className}
    />
  )
}
