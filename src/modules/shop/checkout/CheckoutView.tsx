import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import type { ShopConfig } from '@/config/schema'
import type { Locale } from '@/core/i18n/locales'
import { Container, cx, focusRing, Heading } from '@/theme'
import { Logo } from '@/theme/layout/Logo'
import type { LogoImage } from '@/theme/logo'

import type { CartView } from '../cart/load'
import { cartPath } from '../cart/paths'
import type { CheckoutColours } from '../payments/stripe/appearance'
import type { PaymentElementSettings } from '../payments/stripe/usePaymentElement'
import { CheckoutForm } from './CheckoutForm'
import { CheckoutSummary } from './CheckoutSummary'

/**
 * The checkout shows the logo and a way back to the cart, never the site's menu
 * (docs/design/visual-references.md, "Checkout"). The locale layout draws the site header around
 * every page and no route may change it, so the checkout hides it while it is on the page: the
 * rule applies only while `[data-lc-checkout]` is in the document, so client-side navigation away
 * brings the header back. The site footer stays: it holds the policy pages and the contact.
 */
const HIDE_SITE_HEADER = 'body:has([data-lc-checkout]) header:not([data-lc-checkout] header){display:none}'

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
  const style = { '--lc-checkout-danger': colours.danger, '--lc-checkout-border': colours.inputBorder } as CSSProperties

  return (
    <div data-lc-checkout="" style={style}>
      <style href="lc-checkout-frame" precedence="medium">
        {HIDE_SITE_HEADER}
      </style>
      <header className="border-b border-text/15">
        <Container className="flex min-h-[4.25rem] items-center justify-between gap-x-6 py-3 lg:min-h-[5.5rem]">
          <Logo locale={locale} image={logo} siteName={siteName} priority className="h-7 sm:h-8" />
          <Link
            href={cartPath(locale)}
            className={cx('rounded-[1px] text-[0.9375rem] text-text underline decoration-1 underline-offset-[0.25em] hover:decoration-2', focusRing)}
          >
            {t('backToCart')}
          </Link>
        </Container>
      </header>

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
    </div>
  )
}
