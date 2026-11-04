import type { ReactNode } from 'react'

import { cx } from '@/theme/components/styles'

/** How a photo sits in its tile: whole, never cropped, whatever its shape. */
export const tilePhoto = 'h-full w-full object-contain'

/**
 * The `surface` tile behind every product photo, with a margin of 8 % on each side, so photos
 * taken in different light and shapes still read as one set (docs/design/visual-references.md,
 * "Product list"). Square, and kept even without a photo, so a grid stays aligned.
 */
export function PhotoTile({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cx('rounded-[0.25rem] bg-surface p-[8%]', className)}>
      <div className="aspect-square">{children}</div>
    </div>
  )
}
