'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cx, focusRing } from '@/theme/components/styles'
import type { ImageAttributes } from '@/theme/media'

import { PhotoTile, tilePhoto } from './PhotoTile'

export type GalleryPhoto = {
  /** The large photo, with its variants. */
  image: ImageAttributes
  /** The same photo, small, for its thumbnail button. */
  thumbnail: ImageAttributes
}

/**
 * The product's photos: the first one large, on its tile, and a thumbnail button per photo when
 * there are several. A thumbnail shows its photo in the large tile. Without JavaScript the first
 * photo stays shown.
 */
export function ProductGallery({ photos }: { photos: GalleryPhoto[] }) {
  const t = useTranslations('shop')
  const [current, setCurrent] = useState(0)
  const shown = photos[current] ?? photos[0]

  return (
    <div>
      <PhotoTile>
        {shown && (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- alt comes from the media document
          <img
            key={current}
            {...shown.image}
            // The page's main image: the first one is what the visitor sees first.
            loading="eager"
            fetchPriority={current === 0 ? 'high' : undefined}
            className={tilePhoto}
          />
        )}
      </PhotoTile>
      {photos.length > 1 && (
        <ul aria-label={t('photos')} className="mt-3 flex flex-wrap gap-3">
          {photos.map((photo, index) => (
            // The same photo may be attached twice: the position is what tells them apart.
            <li key={index}>
              <button
                type="button"
                aria-label={t('showPhoto', { index: index + 1, count: photos.length })}
                aria-pressed={index === current}
                onClick={() => setCurrent(index)}
                className={cx(
                  'block w-18 rounded-[0.25rem] border-2 border-transparent p-0.5 sm:w-20',
                  'hover:border-text/30 aria-pressed:border-primary',
                  focusRing,
                )}
              >
                <PhotoTile as="span">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the button's label names the photo */}
                  <img {...photo.thumbnail} alt="" loading="lazy" decoding="async" className={tilePhoto} />
                </PhotoTile>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
