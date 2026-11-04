'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cx } from '@/theme'

type Props = {
  value: number
  /** The most it accepts (the stock left). */
  max: number
  /** Called with a new quantity between 1 and `max`. */
  onChange: (quantity: number) => void
  /** The product's name, for the labels ("Quantity of Lemon verbena"). */
  name: string
  /** A change is on its way: the stepper takes no other until it is done. */
  busy?: boolean
  size?: 'regular' | 'small'
  className?: string
}

const insetFocus = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'

const sizes = {
  regular: { box: 'h-12', button: 'w-11 text-xl', input: 'w-12 text-lg' },
  small: { box: 'h-10', button: 'w-9 text-lg', input: 'w-9 text-base' },
}

/**
 * A quantity: − and + buttons around a number field, from 1 to `max`. The buttons say what they
 * change for screen readers; a typed number counts when the field is left or Enter is pressed.
 *
 * At a limit, or while busy, a button is `aria-disabled` rather than `disabled`: a disabled button
 * drops keyboard focus, and the visitor would lose their place after every press.
 */
export function QuantityStepper({ value, max, onChange, name, busy = false, size = 'regular', className }: Props) {
  const t = useTranslations('cart')
  const [typed, setTyped] = useState<string | null>(null)
  const s = sizes[size]
  const commit = () => {
    if (typed === null) return
    setTyped(null)
    const number = Number.parseInt(typed, 10)
    if (!Number.isFinite(number)) return
    const next = Math.min(Math.max(number, 1), Math.max(max, 1))
    if (next !== value) onChange(next)
  }
  const canLower = !busy && value > 1
  const canRaise = !busy && value < max
  // Focus rings sit inside the box, which clips anything outside its rounded border.
  const button = cx(
    'inline-flex h-full items-center justify-center text-text transition-colors hover:bg-surface aria-disabled:cursor-not-allowed aria-disabled:text-muted aria-disabled:opacity-50 aria-disabled:hover:bg-transparent',
    insetFocus,
    s.button,
  )
  return (
    <div
      role="group"
      aria-label={t('quantityOf', { name })}
      className={cx('inline-flex items-stretch overflow-hidden rounded-[0.1875rem] border border-text/60 bg-background', s.box, className)}
    >
      <button type="button" className={button} aria-label={t('decrease', { name })} aria-disabled={!canLower} onClick={() => canLower && onChange(value - 1)}>
        <span aria-hidden="true">−</span>
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={Math.max(max, 1)}
        step={1}
        value={typed ?? String(value)}
        aria-label={t('quantity')}
        readOnly={busy}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
        className={cx(
          'h-full appearance-none border-x border-text/25 bg-transparent text-center tabular-nums text-text [-moz-appearance:textfield] read-only:text-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          insetFocus,
          s.input,
        )}
      />
      <button type="button" className={button} aria-label={t('increase', { name })} aria-disabled={!canRaise} onClick={() => canRaise && onChange(value + 1)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}
