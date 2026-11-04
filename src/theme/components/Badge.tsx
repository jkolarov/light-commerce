import type { ReactNode } from 'react'

import { cx } from './styles'

const tones = {
  /** Facts: "Récolte 2026", "30 g". A hairline keeps it visible on a `surface` tile. */
  neutral: 'border-text/15 bg-surface text-text',
  /** The rare state worth noticing: "Épuisé", "Nouveau". Outlined, so `primary` stays small. */
  accent: 'border-primary/50 text-primary',
}

/** A short label in sentence case. Say what it means in its text: never colour alone. */
export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof tones; className?: string; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-[0.1875rem] border px-2 py-0.5 text-sm leading-snug', tones[tone], className)}>
      {children}
    </span>
  )
}
