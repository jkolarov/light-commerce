import type { ReactNode } from 'react'

import { cx } from './styles'

const widths = {
  /** The page width: header, footer, blocks (the same as `pageWidth`). */
  page: 'max-w-[76rem]',
  /** About 75 characters of body text: legal pages, a 404. */
  narrow: 'max-w-[46rem]',
}

type Props = {
  as?: 'div' | 'section' | 'article' | 'header' | 'footer' | 'nav' | 'aside'
  width?: keyof typeof widths
  className?: string
  children?: ReactNode
}

/** Centres its content, with the page's side margins. */
export function Container({ as: Tag = 'div', width = 'page', className, children }: Props) {
  return <Tag className={cx('mx-auto w-full', widths[width], 'px-5 sm:px-8 lg:px-12', className)}>{children}</Tag>
}
