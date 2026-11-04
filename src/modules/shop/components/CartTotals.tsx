import { useTranslations } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'
import { cx } from '@/theme'

import type { CartView } from '../cart/load'
import { formatMoney } from '../money'
import { formatTaxRate } from '../products/price'

type Props = {
  cart: CartView
  locale: Locale
  className?: string
}

/** The country names, in the page's language, as a list: "France, Belgique et Suisse". */
function countryNames(codes: string[], locale: Locale): string {
  const names = new Intl.DisplayNames([locale], { type: 'region' })
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(codes.map((code) => names.of(code) ?? code))
}

/**
 * Subtotal, shipping and total, with hairlines between them, then where the shop delivers and the
 * VAT note. The amounts come from the stored prices and `calculateShipping`; the checkout computes
 * the charged amount again on the server.
 */
export function CartTotals({ cart, locale, className }: Props) {
  const t = useTranslations('cart')
  const shopT = useTranslations('shop')
  const money = (cents: number) => formatMoney(cents, { currency: cart.currency, locale })
  const row = 'flex items-baseline justify-between gap-x-6 py-2.5'
  return (
    <div className={className}>
      <dl className="divide-y divide-text/15">
        <div className={row}>
          <dt className="text-muted">{t('subtotal')}</dt>
          <dd className="tabular-nums">{money(cart.subtotal)}</dd>
        </div>
        <div className={row}>
          <dt className="text-muted">{t('shipping')}</dt>
          <dd className="tabular-nums">{money(cart.shipping)}</dd>
        </div>
        <div className={cx(row, 'pt-3.5')}>
          <dt className="font-semibold">{t('total')}</dt>
          <dd className="font-heading text-[1.625rem] leading-none tabular-nums">{money(cart.total)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[0.9375rem] leading-snug text-muted">
        {cart.shipsTo.length > 0 && <>{t('shipsTo', { countries: countryNames(cart.shipsTo, locale) })} </>}
        {shopT('pricesIncludeTax', { rate: formatTaxRate(cart.taxRate, locale) })}
      </p>
    </div>
  )
}
