import { useTranslations } from 'next-intl'

import type { ShopConfig } from '@/config/schema'
import type { Locale } from '@/core/i18n/locales'
import { Container, Heading } from '@/theme'
import type { LogoImage } from '@/theme/logo'

import type { CartView } from '../cart/load'
import type { CheckoutColours } from '../payments/stripe/appearance'
import type { PaymentElementSettings } from '../payments/stripe/usePaymentElement'
import { CheckoutForm } from './CheckoutForm'
import { CheckoutFrame } from './CheckoutFrame'
import { CheckoutSummary } from './CheckoutSummary'

type Props = {
  cart: CartView
  locale: Locale
  siteName: string
  logo: LogoImage
  shipping: ShopConfig['shipping']
  publishableKey: string
  appearance: PaymentElementSettings['appearance']
  colours: CheckoutColours
  paymentFailed: boolean
}

/** The checkout page: the summary on the right (first on phones), the form on the left. */
export function CheckoutView({ cart, locale, siteName, logo, shipping, publishableKey, appearance, colours, paymentFailed }: Props) {
  const t = useTranslations('checkout')
  const names = new Intl.DisplayNames([locale], { type: 'region' })
  const countries = shipping.countries.map((code) => ({ code, name: names.of(code) ?? code }))

  return (
    <CheckoutFrame locale={locale} siteName={siteName} logo={logo} colours={colours}>
      <Container className="pt-10 pb-16 sm:pt-14 sm:pb-24">
        <Heading level={1} size="section">
          {t('title')}
        </Heading>
        <div className="mt-8 grid gap-10 sm:mt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
          <aside
            aria-labelledby="checkout-summary"
            className="rounded-[0.25rem] bg-surface px-6 py-6 sm:px-8 sm:py-7 lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1 lg:self-start"
          >
            <CheckoutSummary cart={cart} locale={locale} headingId="checkout-summary" />
          </aside>
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <CheckoutForm
              locale={locale}
              total={cart.total}
              currency={cart.currency}
              shipping={shipping}
              countries={countries}
              publishableKey={publishableKey}
              appearance={appearance}
              paymentFailed={paymentFailed}
            />
          </div>
        </div>
      </Container>
    </CheckoutFrame>
  )
}
