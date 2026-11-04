'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type MouseEvent, useEffect, useId, useRef } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { cx, focusRing, textLink } from '@/theme'

import { closeCartDrawer, useCartDrawer } from '../cart/drawer'
import type { CartView } from '../cart/load'
import { cartPath } from '../cart/paths'
import { CartLines } from './CartLines'
import { CartTotals } from './CartTotals'
import { CheckoutButton } from './CheckoutButton'
import { EmptyCart } from './EmptyCart'

type Props = {
  locale: Locale
  /** The visitor's cart, or `null` without one. */
  cart: CartView | null
}

// Slides in from the right; the backdrop fades. Both run backwards on close. The global
// reduced-motion rule (globals.css) turns the movement off.
const panel = cx(
  'fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(27rem,calc(100vw-2.5rem))] max-w-none p-0',
  'bg-background text-text shadow-[-24px_0_48px_-24px_color-mix(in_oklab,var(--lc-color-text)_40%,transparent)]',
  'translate-x-full transition-[translate,overlay,display] transition-discrete duration-300 ease-out open:translate-x-0 starting:open:translate-x-full',
  'backdrop:bg-text/40 backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-300 open:backdrop:opacity-100 starting:open:backdrop:opacity-0',
)

/**
 * The cart drawer (docs/design/visual-references.md, "Cart"): a modal panel from the right with
 * the lines (photo and stepper each), the total, the one call to action (checkout) and a link to
 * the cart page. It opens when something is added, or from the header's cart button.
 *
 * A native modal `<dialog>`: the rest of the page is inert while it is open (focus stays in it),
 * Escape closes it, and focus goes back to what opened it. It also closes on a click on the
 * backdrop, when a link in it is followed and when the page changes. When it opens on an add,
 * screen readers hear "Added to your cart: …" (the dialog's description).
 */
export function CartDrawer({ locale, cart }: Props) {
  const t = useTranslations('cart')
  const close = useTranslations('common')('close')
  const { open, announcement } = useCartDrawer()
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)
  const titleId = useId()
  const statusId = useId()
  const pathname = usePathname()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      opener.current = document.activeElement
      element.showModal()
      // The page behind stays put while the drawer is open.
      document.documentElement.style.overflow = 'hidden'
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])

  // A new page (a link followed, Back) closes it.
  useEffect(() => {
    closeCartDrawer()
  }, [pathname])

  /** The dialog closed (Escape, the close button, a link): puts the page back as it was. */
  const onClose = () => {
    closeCartDrawer()
    document.documentElement.style.overflow = ''
    const back = opener.current
    opener.current = null
    if (back instanceof HTMLElement && back.isConnected) back.focus()
  }

  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    // The backdrop is the dialog itself; its content fills it.
    if (event.target === event.currentTarget || (event.target as Element).closest('a')) dialog.current?.close()
  }

  const lines = cart && cart.lines.length > 0 ? cart : null

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={announcement ? statusId : undefined}
      onClose={onClose}
      onClick={onClick}
      className={panel}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-text/15 px-5 py-4 sm:px-7">
          <h2 id={titleId} tabIndex={-1} className="font-heading text-[1.75rem] font-light leading-tight focus:outline-none">
            {t('title')}
            {lines && <span className="ml-3 font-body text-base text-muted">{t('itemCount', { count: lines.count })}</span>}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={close}
            className={cx('-mr-2 inline-flex size-11 items-center justify-center rounded-[0.1875rem] text-text hover:bg-surface', focusRing)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <p id={statusId} role="status" className="mx-5 mt-4 flex items-start gap-2.5 rounded-[0.25rem] bg-surface px-4 py-3 text-[0.9375rem] leading-snug empty:hidden sm:mx-7">
          {announcement && (
            <>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10.5l4 4 8-9" />
              </svg>
              <span>{announcement}</span>
            </>
          )}
        </p>

        {lines ? (
          <>
            <CartLines cart={lines} locale={locale} compact focusAfterRemove={titleId} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-7" />
            <div className="border-t border-text/15 px-5 pt-3 pb-6 sm:px-7">
              <CartTotals cart={lines} locale={locale} />
              <CheckoutButton cart={lines} locale={locale} className="mt-5" />
              <p className="mt-4 text-center">
                <Link href={cartPath(locale)} className={textLink}>
                  {t('viewCart')}
                </Link>
              </p>
            </div>
          </>
        ) : (
          <EmptyCart locale={locale} compact className="px-5 py-8 sm:px-7" />
        )}
      </div>
    </dialog>
  )
}
