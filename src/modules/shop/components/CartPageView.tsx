import Link from 'next/link'
import { useTranslations } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'
import { Container, Heading, textLink } from '@/theme'

import type { CartView } from '../cart/load'
import { shopPath } from '../products/paths'
import { CartLines } from './CartLines'
import { CartTotals } from './CartTotals'
import { CheckoutButton } from './CheckoutButton'
import { EmptyCart } from './EmptyCart'

const HEADING_ID = 'cart-heading'

/**
 * The cart page: the lines on the left, the summary (totals, checkout, back to the shop) on a
 * `surface` panel on the right that stays in view while the lines scroll. On phones the summary
 * follows the lines. An empty cart says so and points to the shop.
 */
export function CartPageView({ cart, locale }: { cart: CartView | null; locale: Locale }) {
  const t = useTranslations('cart')
  const lines = cart && cart.lines.length > 0 ? cart : null
  return (
    <Container className="pt-10 pb-16 sm:pt-14 sm:pb-24">
      {/* Focus lands here when a removed line takes its button away. */}
      <div id={HEADING_ID} tabIndex={-1} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 focus:outline-none">
        <Heading level={1} size="section">
          {t('title')}
        </Heading>
        {lines && <p className="text-muted">{t('itemCount', { count: lines.count })}</p>}
      </div>

      {lines ? (
        <div className="mt-8 grid gap-10 sm:mt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-16">
          <CartLines cart={lines} locale={locale} focusAfterRemove={HEADING_ID} />
          <aside aria-labelledby="cart-summary" className="rounded-[0.25rem] bg-surface px-6 py-6 sm:px-8 sm:py-7 lg:sticky lg:top-8 lg:self-start">
            <Heading level={2} size="small" id="cart-summary">
              {t('summary')}
            </Heading>
            <CartTotals cart={lines} locale={locale} className="mt-3" />
            <CheckoutButton cart={lines} locale={locale} className="mt-6" />
            <p className="mt-5 text-center text-[0.9375rem]">
              <Link href={shopPath(locale)} className={textLink}>
                {t('continueShopping')}
              </Link>
            </p>
          </aside>
        </div>
      ) : (
        <EmptyCart locale={locale} className="mt-8 border-t border-text/15 pt-8" />
      )}
    </Container>
  )
}
