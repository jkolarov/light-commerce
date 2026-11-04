import type { Locale } from '@/core/i18n/locales'
import type { ImageTextBlock } from '@/payload-types'

import { asMedia } from '../shared/media'
import { MediaImage } from '../shared/MediaImage'
import { RichTextContent } from '../shared/RichTextContent'
import { blockSpacing, container, photoFrame, sectionHeading } from '../shared/styles'

type Props = ImageTextBlock & { locale: Locale }

// A portrait photo beside the text on wide screens (left or right, as the editor chose), above it
// on phones. The photo comes first in the markup in both cases, so phones read it first.
export function ImageText({ heading, content, image, imagePosition, caption, locale }: Props) {
  const right = imagePosition === 'right'
  const photo = asMedia(image)
  const textColumn = photo
    ? right
      ? 'md:col-span-6 md:col-start-1 md:row-start-1'
      : 'md:col-span-6 md:col-start-7 md:row-start-1'
    : 'md:col-span-8'
  return (
    <section className={`${container} ${blockSpacing}`} data-image-position={right ? 'right' : 'left'}>
      <div className="grid items-center gap-8 md:grid-cols-12 md:gap-10 lg:gap-x-16">
        {photo && (
          <figure className={right ? 'md:col-span-5 md:col-start-8 md:row-start-1' : 'md:col-span-5 md:col-start-1 md:row-start-1'}>
            <div className={photoFrame}>
              <MediaImage
                media={photo}
                sizes="(min-width: 76rem) 28rem, (min-width: 48rem) 40vw, calc(100vw - 2.5rem)"
                className="aspect-[4/5] h-auto w-full object-cover"
              />
            </div>
            {caption?.trim() && <figcaption className="mt-3 text-[0.9375rem] leading-snug text-muted">{caption}</figcaption>}
          </figure>
        )}
        <div className={textColumn}>
          {heading?.trim() && <h2 className={`${sectionHeading} mb-6`}>{heading}</h2>}
          <RichTextContent data={content} locale={locale} className="max-w-[36rem]" />
        </div>
      </div>
    </section>
  )
}
