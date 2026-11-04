import Link from 'next/link'

import type { Locale } from '@/core/i18n/locales'
import { localePath } from '@/core/i18n/path'

import { cx, focusRing } from '../components/styles'

type Props = { locale: Locale; logo: string; siteName: string; className?: string }

/**
 * The logo from light.config.ts, linking to the home page. The logo is expected to carry the name
 * (a wordmark or a lockup), so the site name is its text alternative rather than shown beside it.
 * The file has its own colours; the theme only sets its height (`className`).
 */
export function Logo({ locale, logo, siteName, className }: Props) {
  return (
    <Link href={localePath(locale)} className={cx('inline-flex shrink-0 rounded-[2px]', focusRing)}>
      {/* A file under public/ in any format, drawn at a fixed height: next/image adds nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={siteName} className={cx('block w-auto', className)} />
    </Link>
  )
}
