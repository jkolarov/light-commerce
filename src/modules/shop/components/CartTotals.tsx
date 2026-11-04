import { useTranslations } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'
import { cx } from '@/theme'

import type { CartView } from '../cart/load'
import { formatMoney } from '../money'
import { formatTaxRate } from '../products/price'

/** What the totals show: a cart's, or a paid order's (no `shipsTo` there). */
export type Totals = Pick<CartView, 'subtotal' | 'shipping' | 'total' | 'currency' | 'shipsTo' | 'taxRate'>

type Props = {
  cart: Totals
  locale: Locale
  /** The drawer's tighter rows, so its lines keep the room; the VAT note only. */
  compact?: boolean
  className?: string
}

/** The country names, in the page's language, as a list: "France, Belgique et Suisse". */
function countryNames(codes: string[], locale: Locale): string {
  const names = new Intl.DisplayNames([locale], { type: 'region' })
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(codes.map((code) => names.of(code) ?? code))
}

/**
 * Subtotal, shipping and total, with hairlines between them, then where the shop delivers (not in
 * the drawer) and the VAT note. The amounts come from the stored prices and `calculateShipping`; the checkout computes
 * the charged amount again on the server.
 */
export function CartTotals({ cart, locale, compact = false, className }: Props) {
  const t = useTranslations('cart')
  const shopT = useTranslations('shop')
  const money = (cents: number) => formatMoney(cents, { currency: cart.currency, locale })
  const row = cx('flex items-baseline justify-between gap-x-6', compact ? 'py-1.5' : 'py-2.5')
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
        <div className={cx(row, compact ? 'pt-2.5' : 'pt-3.5')}>
          <dt className="font-semibold">{t('total')}</dt>
          <dd className={cx('font-heading leading-none tabular-nums', compact ? 'text-[1.375rem]' : 'text-[1.625rem]')}>{money(cart.total)}</dd>
        </div>
      </dl>
      <p className={cx('leading-snug text-muted', compact ? 'mt-2 text-sm' : 'mt-3 text-[0.9375rem]')}>
        {!compact && cart.shipsTo.length > 0 && <>{t('shipsTo', { countries: countryNames(cart.shipsTo, locale) })} </>}
        {shopT('pricesIncludeTax', { rate: formatTaxRate(cart.taxRate, locale) })}
      </p>
    </div>
  )
}
