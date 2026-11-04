'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { cx } from '@/theme'

import type { CartView } from '../cart/load'
import { CartLineItem } from './CartLineItem'

type Props = {
  cart: CartView
  locale: Locale
  compact?: boolean
  /** The id of the heading to move focus to once a line is removed (its button is gone with it). */
  focusAfterRemove: string
  className?: string
}

/** The cart's lines, with hairlines between them. Says when a line was removed. */
export function CartLines({ cart, locale, compact = false, focusAfterRemove, className }: Props) {
  const t = useTranslations('cart')
  const [removed, setRemoved] = useState<string | null>(null)
  const onRemoved = (name: string) => {
    setRemoved(t('removed', { name }))
    document.getElementById(focusAfterRemove)?.focus()
  }
  return (
    <div className={className}>
      <ul className={cx('divide-y divide-text/15', !compact && 'border-y border-text/15')}>
        {cart.lines.map((line) => (
          <CartLineItem key={line.id} line={line} locale={locale} currency={cart.currency} compact={compact} onRemoved={onRemoved} />
        ))}
      </ul>
      <p role="status" className="sr-only">
        {removed}
      </p>
    </div>
  )
}
