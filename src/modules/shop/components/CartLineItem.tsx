'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { Badge, cx, focusRing } from '@/theme'

import { type CartActionProblem, removeLine, setLineQuantity } from '../cart/actions'
import type { CartLine } from '../cart/load'
import { formatMoney } from '../money'
import { PhotoTile, tilePhoto } from './PhotoTile'
import { QuantityStepper } from './QuantityStepper'
import { useCartProblemMessage } from './cartMessages'

type Props = {
  line: CartLine
  locale: Locale
  currency: string
  /** The drawer's tighter line (name in an h3), or the cart page's (h2). */
  compact?: boolean
  /** Called once the line is gone, with its name, so the list can say so and move focus. */
  onRemoved: (name: string) => void
}

const quietButton = cx(
  'rounded-[1px] text-[0.9375rem] text-muted underline decoration-1 underline-offset-[0.2em] hover:text-text disabled:opacity-50',
  focusRing,
)

/**
 * One line of the cart: the photo on its `surface` tile, the name (a link to the product page),
 * the unit price, a quantity stepper, "Remove" and the line's total. A line that can't be bought
 * as it is (sold out, fewer left, no longer for sale) says so and how to fix it.
 */
export function CartLineItem({ line, locale, currency, compact = false, onRemoved }: Props) {
  const t = useTranslations('cart')
  const shopT = useTranslations('shop')
  const problemMessage = useCartProblemMessage()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<CartActionProblem | null>(null)
  const money = (cents: number) => formatMoney(cents, { currency, locale })
  const name = line.title ?? t('unavailableName')
  const { problem } = line
  const canChange = problem?.kind !== 'unavailable' && problem?.kind !== 'soldOut'
  // Under the drawer's h2, or the cart page's h1.
  const Name = compact ? 'h3' : 'h2'

  const setQuantity = (quantity: number) =>
    startTransition(async () => {
      const result = await setLineQuantity({ lineId: line.id, quantity })
      setError(result.ok ? null : result.problem)
    })
  const remove = () =>
    startTransition(async () => {
      const result = await removeLine({ lineId: line.id })
      if (result.ok) onRemoved(name)
      else setError(result.problem)
    })

  const notice = (() => {
    if (!problem) return null
    if (problem.kind === 'soldOut') return t('lineSoldOut')
    if (problem.kind === 'unavailable') return t('lineUnavailable')
    return t('lineNotEnough', { count: problem.available })
  })()

  return (
    <li
      aria-busy={pending || undefined}
      className={cx(
        'grid gap-x-4 py-5 transition-opacity',
        compact ? 'grid-cols-[4.5rem_minmax(0,1fr)]' : 'grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-6 sm:py-7',
        pending && 'opacity-60',
      )}
    >
      <PhotoTile as="span" className="self-start">
        {line.image && (
          // The name is next to it: the photo adds nothing for screen readers.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.image.src} width={line.image.width} height={line.image.height} alt="" loading="lazy" decoding="async" className={tilePhoto} />
        )}
      </PhotoTile>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-x-4">
          <Name className={cx('font-heading leading-snug text-text', compact ? 'text-lg' : 'text-xl sm:text-[1.375rem]')}>
            {line.href ? (
              <Link href={line.href} className={cx('rounded-[1px] decoration-1 underline-offset-[0.2em] hover:underline', focusRing)}>
                {name}
              </Link>
            ) : (
              <span className="text-muted">{name}</span>
            )}
          </Name>
          {line.lineTotal !== null && <p className="shrink-0 tabular-nums text-text">{money(line.lineTotal)}</p>}
        </div>
        {line.unitPrice !== null && <p className="mt-0.5 text-[0.9375rem] text-muted tabular-nums">{t('unitPrice', { price: money(line.unitPrice) })}</p>}

        {notice && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.9375rem] text-text">
            {problem?.kind === 'soldOut' && <Badge tone="accent">{shopT('outOfStock')}</Badge>}
            <span>{notice}</span>
            {problem?.kind === 'notEnoughStock' && (
              <button type="button" className={quietButton} disabled={pending} onClick={() => setQuantity(problem.available)}>
                {t('keep', { count: problem.available })}
              </button>
            )}
          </p>
        )}

        <div className={cx('flex flex-wrap items-center gap-x-5 gap-y-2', compact ? 'mt-3' : 'mt-4')}>
          {canChange && (
            <QuantityStepper
              value={line.quantity}
              max={Math.max(line.maxQuantity, line.quantity)}
              onChange={setQuantity}
              name={name}
              disabled={pending}
              size={compact ? 'small' : 'regular'}
            />
          )}
          <button type="button" className={quietButton} disabled={pending} onClick={remove} aria-label={t('removeItem', { name })}>
            {t('remove')}
          </button>
        </div>

        <p aria-live="polite" className="text-[0.9375rem] text-text">
          {error && <span className="mt-2 block">{problemMessage(error)}</span>}
        </p>
      </div>
    </li>
  )
}
