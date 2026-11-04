import Link from 'next/link'

import type { Locale } from '@/core/i18n/locales'
import { localePath } from '@/core/i18n/path'

import { cx, focusRing } from '../components/styles'
import type { LogoImage } from '../logo'

type Props = {
  locale: Locale
  /** The logo and its size (`logoImage` in ../logo.ts). */
  image: LogoImage
  siteName: string
  /** The header's logo: fetched first. The footer's waits until it is near. */
  priority?: boolean
  className?: string
}

/**
 * The logo from light.config.ts, linking to the home page. The logo is expected to carry the name
 * (a wordmark or a lockup), so the site name is its text alternative rather than shown beside it.
 * The file has its own colours. The theme sets its height (`className`); its width and height
 * attributes give the aspect ratio, so the space is reserved before it loads.
 */
export function Logo({ locale, image, siteName, priority = false, className }: Props) {
  return (
    <Link href={localePath(locale)} className={cx('inline-flex shrink-0 rounded-[2px]', focusRing)}>
      {/* A file under public/ in any format, drawn at a fixed height: next/image adds nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt={siteName}
        width={image.width}
        height={image.height}
        fetchPriority={priority ? 'high' : undefined}
        loading={priority ? undefined : 'lazy'}
        decoding="async"
        className={cx('block w-auto', className)}
      />
    </Link>
  )
}
