import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { Container, cx, focusRing } from '@/theme'
import { Logo } from '@/theme/layout/Logo'
import type { LogoImage } from '@/theme/logo'

import { cartPath } from '../cart/paths'
import type { CheckoutColours } from '../payments/stripe/appearance'

/**
 * The checkout shows the logo and a way back to the cart, never the site's menu
 * (docs/design/visual-references.md, "Checkout"). The locale layout draws the site header around
 * every page and no route may change it, so the checkout hides it while it is on the page: the
 * rule applies only while `[data-lc-checkout]` is in the document, so client-side navigation away
 * brings the header back. The site footer stays: it holds the policy pages and the contact.
 */
export const HIDE_SITE_HEADER = 'body:has([data-lc-checkout]) header:not([data-lc-checkout] header){display:none}'

type Props = {
  locale: Locale
  siteName: string
  logo: LogoImage
  colours: CheckoutColours
  children: ReactNode
}

/** The checkout's frame: its own header (logo, back to the cart), and the colours its form shares with Stripe's. */
export function CheckoutFrame({ locale, siteName, logo, colours, children }: Props) {
  const t = useTranslations('checkout')
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
      {children}
    </div>
  )
}
