import type { Locale } from '@/core/i18n/locales'
import { localePath } from '@/core/i18n/path'

// The checkout's addresses. `checkoutPath` and `cartPath` are in ../cart/paths.ts.

/** Where Stripe sends the browser after a payment (and where the form goes after a card payment). */
export const checkoutReturnPath = (locale: Locale) => localePath(locale, '/checkout/return')

/**
 * "Payment received": the order is on its way, or the payment is still being checked
 * (`checking`, when the server could not tell).
 */
export const paymentReceivedPath = (locale: Locale, checking = false) =>
  localePath(locale, `/checkout/received${checking ? '?checking=1' : ''}`)

/** The checkout again, saying the payment did not go through. */
export const paymentFailedPath = (locale: Locale) => localePath(locale, '/checkout?payment=failed')

/** The cart, saying the checkout sent the visitor back because something changed. */
export const cartChangedPath = (locale: Locale) => localePath(locale, '/cart?notice=changed')

/** The order's confirmation page (S18): only with its access token. */
export const orderPath = (locale: Locale, orderId: number | string, token: string) =>
  localePath(locale, `/order/${encodeURIComponent(String(orderId))}?token=${encodeURIComponent(token)}`)
