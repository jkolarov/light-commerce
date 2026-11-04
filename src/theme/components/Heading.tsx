import type { ReactNode } from 'react'

import { cx } from './styles'

// Type sets the hierarchy, not colour or weight: large headings are light and quiet, small ones
// regular. Sentence case, never all caps.
const sizes = {
  /** A page's title. */
  display: 'text-[2.5rem] font-light leading-[1.06] tracking-[-0.015em] sm:text-[3.25rem] lg:text-[4.125rem]',
  /** A section's heading. */
  section: 'text-[1.875rem] font-light leading-[1.12] tracking-[-0.01em] sm:text-[2.375rem]',
  /** A card, a product name, a small section. */
  title: 'text-[1.375rem] font-normal leading-[1.25] sm:text-2xl',
  /** The smallest heading, in running text. */
  small: 'text-lg font-medium leading-snug',
}

const defaultSize = { 1: 'display', 2: 'section', 3: 'title', 4: 'small' } as const

type Props = {
  /** The heading level in the page outline: h1 to h4. */
  level: 1 | 2 | 3 | 4
  /** How big it looks, when that differs from what the level gives. */
  size?: keyof typeof sizes
  className?: string
  id?: string
  children: ReactNode
}

/** A heading in the theme's heading font. */
export function Heading({ level, size = defaultSize[level], className, id, children }: Props) {
  const Tag = `h${level}` as const
  return (
    <Tag id={id} className={cx('font-heading text-balance text-text', sizes[size], className)}>
      {children}
    </Tag>
  )
}
