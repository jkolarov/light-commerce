'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { type FormEvent, useState, useTransition } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { cx, focusRing, textLink } from '@/theme'

import { addToCart, type CartActionProblem } from '../cart/actions'
import { openCartDrawer } from '../cart/drawer'
import { cartPath } from '../cart/paths'
import { formatMoney } from '../money'
import { useCartProblemMessage } from './cartMessages'
import { QuantityStepper } from './QuantityStepper'

export type AddToCartProps = {
  productId: number
  /** The product's name, for the stepper's labels and "Added to your cart: …". */
  name: string
  /** Cents. */
  unitPrice: number
  currency: string
  locale: Locale
  /** How many more fit in the cart: the stock left once the cart's own are counted. */
  addable: number
  /** How many the cart already holds. */
  inCart: number
}

/**
 * The product page's add-to-cart: a quantity stepper and a full-width button that shows what the
 * chosen quantity costs. Adding opens the cart drawer. The product page draws it only for a
 * product with a price that is not sold out; the server checks stock again on every add.
 */
export function AddToCart({ productId, name, unitPrice, currency, locale, addable, inCart }: AddToCartProps) {
  const t = useTranslations('cart')
  const shopT = useTranslations('shop')
  const problemMessage = useCartProblemMessage()
  const [chosen, setChosen] = useState(1)
  const [problem, setProblem] = useState<CartActionProblem | null>(null)
  const [pending, startTransition] = useTransition()
  const quantity = Math.min(chosen, Math.max(addable, 1))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    startTransition(async () => {
      const result = await addToCart({ productId, quantity })
      if (!result.ok) {
        setProblem(result.problem)
        return
      }
      setProblem(null)
      setChosen(1)
      openCartDrawer(t('added', { name, count: quantity }))
    })
  }

  const already =
    inCart > 0 ? (
      <p className="mt-3 text-[0.9375rem] text-muted">
        {t('inCart', { count: inCart })}{' '}
        <Link href={cartPath(locale)} className={textLink}>
          {t('viewCart')}
        </Link>
      </p>
    ) : null

  if (addable === 0) {
    return (
      <div>
        <p className="text-text">{t('allInCart')}</p>
        {already}
      </div>
    )
  }

  return (
    <form onSubmit={submit} aria-busy={pending || undefined}>
      <div className="flex gap-3">
        <QuantityStepper value={quantity} max={addable} onChange={setChosen} name={name} busy={pending} />
        {/* Not `disabled` while adding: it keeps focus, so the drawer can give it back on close. */}
        <button
          type="submit"
          aria-disabled={pending || undefined}
          className={cx(
            'inline-flex min-h-12 flex-1 items-center justify-between gap-4 rounded-[0.1875rem] bg-primary px-5 text-base font-semibold text-primary-contrast transition-colors hover:bg-primary/88 aria-disabled:opacity-70',
            focusRing,
          )}
        >
          <span>{shopT('addToCart')}</span>
          <span className="tabular-nums font-normal">{formatMoney(unitPrice * quantity, { currency, locale })}</span>
        </button>
      </div>
      {already}
      <p aria-live="polite" className="text-[0.9375rem] text-text">
        {problem && <span className="mt-3 block">{problemMessage(problem)}</span>}
      </p>
    </form>
  )
}
