import config from '@payload-config'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import { logoImage } from '@/theme/logo'

import { readCartRef } from '../cart/cookie'
import { currentCart } from '../cart/current'
import { cartPath } from '../cart/paths'
import { shopConfig } from '../config'
import { checkoutColours, stripeAppearance } from '../payments/stripe/appearance'
import { readStripeSettings } from '../payments/stripe/env'
import { CheckoutView } from './CheckoutView'
import { type CheckoutOutcome, confirmCheckout, outcomePath } from './confirm'
import { PaymentReceivedView } from './PaymentReceivedView'

// The checkout's routes: `src/app/(frontend)/[locale]/checkout/` (the page, `received/` and the
// `return/` route handler) are thin wrappers around these.

/** Every checkout page is the visitor's own: out of search engines. */
const robots = { index: false, follow: false }

/**
 * The checkout for the cart in the visitor's cookie. No cart, or nothing in it: the cart page
 * says so. A cart that can't be bought as it is: the cart page flags the lines to fix.
 */
export async function CheckoutPage({ locale, paymentFailed }: { locale: Locale; paymentFailed: boolean }) {
  const cart = await currentCart(locale)
  if (!cart || cart.lines.length === 0 || !cart.canCheckout) redirect(cartPath(locale))
  const { site, theme } = getLightConfig()
  const { publishableKey } = readStripeSettings()
  if (!publishableKey) console.error('Shop: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set: the checkout cannot show the card form.')
  return (
    <CheckoutView
      cart={cart}
      locale={locale}
      siteName={site.name}
      logo={await logoImage(theme.logo)}
      shipping={shopConfig().shipping}
      publishableKey={publishableKey}
      appearance={stripeAppearance(theme)}
      colours={checkoutColours(theme.colors)}
      paymentFailed={paymentFailed}
    />
  )
}

export async function checkoutMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'checkout' })
  return { title: t('title'), robots }
}

/** "Payment received" (or still being checked), after the return path. */
export function PaymentReceivedPage({ locale, checking }: { locale: Locale; checking: boolean }) {
  return <PaymentReceivedView locale={locale} checking={checking} contactEmail={getLightConfig().site.contactEmail} />
}

export async function paymentReceivedMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'checkout' })
  return { title: t('receivedTitle'), robots }
}

/**
 * `GET /<locale>/checkout/return?payment_intent=pi_…`: Stripe's return URL, and where the form
 * sends the browser after a card payment. Settles the payment for the cart in the cookie, then
 * sends the browser on (`outcomePath`). Safe to load again: the order is created once.
 */
export async function checkoutReturn(request: Request, locale: Locale): Promise<Response> {
  const paymentIntentId = new URL(request.url).searchParams.get('payment_intent')
  let outcome: CheckoutOutcome
  try {
    outcome = await confirmCheckout(await getPayload({ config }), { paymentIntentId, cart: await readCartRef() })
  } catch (error) {
    console.error(`Shop: could not confirm the payment ${String(paymentIntentId)}`, error)
    outcome = { kind: 'checking' }
  }
  // A relative Location: right behind any proxy, whatever host the server sees.
  return new Response(null, { status: 303, headers: { Location: outcomePath(locale, outcome), 'Cache-Control': 'no-store' } })
}
