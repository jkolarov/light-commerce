'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { MouseEvent } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { cx, focusRing } from '@/theme'

import { openCartDrawer } from '../cart/drawer'
import type { CartView } from '../cart/load'
import { cartPath } from '../cart/paths'
import { CartDrawer } from './CartDrawer'

type Props = {
  locale: Locale
  /** The visitor's cart, or `null` without one. */
  cart: CartView | null
}

/**
 * The header's cart: a link to the cart page with the number of items, and the drawer. A plain
 * click opens the drawer instead (on the cart page itself, it is just the link); a click with a
 * modifier key, or the link without JavaScript, goes to the cart page.
 */
export function CartControl({ locale, cart }: Props) {
  const t = useTranslations('cart')
  const label = useTranslations('nav')('cart')
  const pathname = usePathname()
  const href = cartPath(locale)
  const count = cart?.count ?? 0

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || pathname === href) return
    event.preventDefault()
    openCartDrawer()
  }

  return (
    <>
      <Link
        href={href}
        onClick={onClick}
        aria-label={t('open', { count })}
        aria-haspopup="dialog"
        className={cx('-mx-1 inline-flex min-h-11 items-center gap-2 rounded-[0.1875rem] px-1 text-[1.0625rem] text-text hover:underline decoration-1 underline-offset-[0.45em]', focusRing)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M5 8.5h14l-1.1 11.6a1 1 0 0 1-1 .9H7.1a1 1 0 0 1-1-.9L5 8.5Z" />
          <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
        {count > 0 && (
          <span
            aria-hidden="true"
            className="inline-flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-full bg-primary px-1.5 text-[0.8125rem] font-semibold tabular-nums text-primary-contrast"
          >
            {count}
          </span>
        )}
      </Link>
      <CartDrawer locale={locale} cart={cart} />
    </>
  )
}
