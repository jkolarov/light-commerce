import type { ReactNode } from 'react'

import { cx } from '@/theme/components/styles'

/** How a photo sits in its tile: whole, never cropped, whatever its shape. */
export const tilePhoto = 'h-full w-full object-contain'

type Props = {
  /** `span` inside a button or a link, where a `div` is not allowed. */
  as?: 'div' | 'span'
  className?: string
  children?: ReactNode
}

/**
 * The `surface` tile behind every product photo, with a margin of 8 % on each side, so photos
 * taken in different light and shapes still read as one set (docs/design/visual-references.md,
 * "Product list"). Square, and kept even without a photo, so a grid stays aligned.
 */
export function PhotoTile({ as: Tag = 'div', className, children }: Props) {
  return (
    <Tag className={cx('block rounded-[0.25rem] bg-surface p-[8%]', className)}>
      <Tag className="block aspect-square">{children}</Tag>
    </Tag>
  )
}
