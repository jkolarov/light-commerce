import { useId } from 'react'
import { useTranslations } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'
import { Button, cx } from '@/theme'

import type { CartView } from '../cart/load'
import { checkoutPath } from '../cart/paths'

/**
 * The cart's one call to action: to the checkout. While a line needs fixing it is a disabled
 * button, with the reason under it. An empty cart has no checkout button at all.
 */
export function CheckoutButton({ cart, locale, className }: { cart: CartView; locale: Locale; className?: string }) {
  const t = useTranslations('cart')
  const noteId = useId()
  if (cart.lines.length === 0) return null
  if (cart.canCheckout) {
    return (
      <Button href={checkoutPath(locale)} className={cx('w-full text-base', className)}>
        {t('checkout')}
      </Button>
    )
  }
  return (
    <div className={className}>
      <Button disabled aria-describedby={noteId} className="w-full cursor-not-allowed text-base opacity-50">
        {t('checkout')}
      </Button>
      <p id={noteId} className="mt-2 text-[0.9375rem] leading-snug text-text">
        {t('fixToCheckout')}
      </p>
    </div>
  )
}
