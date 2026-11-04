import type { ReactNode } from 'react'

import { cx } from './styles'

/**
 * Running text (rich text, legal pages): paragraphs, headings, lists, quotes and links in the
 * theme's type. The styles are `.lc-prose` in globals.css, because they target the plain elements
 * rich text produces.
 */
export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('lc-prose', className)}>{children}</div>
}
