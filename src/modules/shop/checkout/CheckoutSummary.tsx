import { useTranslations } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'
import { Heading } from '@/theme'

import type { CartLine } from '../cart/load'
import { CartTotals, type Totals } from '../components/CartTotals'
import { PhotoTile, tilePhoto } from '../components/PhotoTile'
import { formatMoney } from '../money'

/** What the summary shows: the cart at the checkout, or a paid order on its confirmation page. */
export type Summary = Totals & { count: number; lines: Pick<CartLine, 'id' | 'title' | 'image' | 'quantity' | 'lineTotal'>[] }

/**
 * What the visitor pays (or paid) for: each line with its photo, name, quantity and total, then
 * subtotal, shipping, total and the VAT note (the cart's own totals). Read-only.
 */
export function CheckoutSummary({ cart, locale, headingId }: { cart: Summary; locale: Locale; headingId: string }) {
  const t = useTranslations('checkout')
  const cartT = useTranslations('cart')
  const money = (cents: number) => formatMoney(cents, { currency: cart.currency, locale })
  return (
    <>
      <div className="flex items-baseline justify-between gap-x-4">
        <Heading level={2} size="small" id={headingId}>
          {t('summary')}
        </Heading>
        <p className="text-[0.9375rem] text-muted">{cartT('itemCount', { count: cart.count })}</p>
      </div>
      <ul className="mt-4 divide-y divide-text/15 border-y border-text/15">
        {cart.lines.map((line) => (
          <li key={line.id} className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-4 py-4">
            <PhotoTile className="p-[6%]">
              {line.image && (
                // The name is next to it: the photo adds nothing for screen readers.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={line.image.src} width={line.image.width} height={line.image.height} alt="" loading="lazy" decoding="async" className={tilePhoto} />
              )}
            </PhotoTile>
            <div className="min-w-0">
              <p className="font-heading text-lg leading-snug text-text">{line.title ?? cartT('unavailableName')}</p>
              <p className="text-[0.9375rem] text-muted">{t('quantity', { count: line.quantity })}</p>
            </div>
            {line.lineTotal !== null && <p className="tabular-nums text-text">{money(line.lineTotal)}</p>}
          </li>
        ))}
      </ul>
      <CartTotals cart={cart} locale={locale} className="mt-2" />
    </>
  )
}
