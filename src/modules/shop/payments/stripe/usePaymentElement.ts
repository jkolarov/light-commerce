'use client'

import { type Appearance, loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js'
import { useEffect, useRef, useState } from 'react'

import type { Locale } from '@/core/i18n/locales'

// Stripe's Payment Element in the checkout: Stripe draws the card fields in its own iframe, so card
// data never reaches this site (design 4.8). The element is mounted before any payment exists
// (Stripe's "deferred intent" flow), with the total the page shows. When the visitor pays:
//   1. `submit()`: Stripe checks its own fields;
//   2. the checkout starts the payment on the server and gets the PaymentIntent's client secret;
//   3. `confirm()`: Stripe charges the card. A card that needs no extra step comes straight back;
//      one that does (3-D Secure, a bank's page) may leave the site and return to `returnUrl`.
//
// Billing details come from the checkout's own form (the shipping address), so Stripe asks only
// for the card itself.

export type PaymentElementSettings = {
  /** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, read on the server. Empty: no payment form. */
  publishableKey: string
  /** Cents: the total the page shows. The charged amount is the server's, on the PaymentIntent. */
  amount: number
  /** ISO 4217, like 'EUR'. */
  currency: string
  locale: Locale
  appearance: Appearance
}

export type BillingDetails = {
  name: string
  email: string
  phone: string
  address: { line1: string; line2: string; city: string; postalCode: string; country: string }
}

export type PaymentElementState = 'loading' | 'ready' | 'unavailable'

export type Confirmation =
  /** Paid, or accepted and being settled by Stripe. */
  | { kind: 'paid'; paymentIntentId: string }
  /** Not paid: `message` is Stripe's own words for the visitor (a declined card), when it has some. */
  | { kind: 'notPaid'; message: string | null }

type Loaded = { stripe: Stripe; elements: StripeElements }

export function usePaymentElement(settings: PaymentElementSettings) {
  const mountRef = useRef<HTMLDivElement>(null)
  const loaded = useRef<Loaded | null>(null)
  const [loadedState, setState] = useState<Exclude<PaymentElementState, 'unavailable'> | 'failed'>('loading')
  const { publishableKey, amount, currency, locale, appearance } = settings
  // Without a key there is no form to load.
  const state: PaymentElementState = !publishableKey || loadedState === 'failed' ? 'unavailable' : loadedState
  // The appearance comes from the server as a new object on each render: compare its contents.
  const look = JSON.stringify(appearance)

  useEffect(() => {
    let cancelled = false
    let unmount: (() => void) | undefined
    if (!publishableKey) return
    loadStripe(publishableKey, { locale })
      .then((stripe) => {
        const node = mountRef.current
        if (cancelled || !node) return
        if (!stripe) return setState('failed')
        const elements = stripe.elements({ mode: 'payment', amount, currency: currency.toLowerCase(), appearance: JSON.parse(look) as Appearance })
        const element = elements.create('payment', {
          layout: 'tabs',
          fields: { billingDetails: { name: 'never', email: 'never', phone: 'never', address: 'never' } },
        })
        element.on('ready', () => !cancelled && setState('ready'))
        element.on('loaderror', () => !cancelled && setState('failed'))
        element.mount(node)
        loaded.current = { stripe, elements }
        unmount = () => element.destroy()
      })
      .catch(() => !cancelled && setState('failed'))
    return () => {
      cancelled = true
      loaded.current = null
      unmount?.()
    }
  }, [publishableKey, amount, currency, locale, look])

  /** Stripe checks its fields and shows what is missing. False when something is. */
  async function submit(): Promise<boolean> {
    if (!loaded.current) return false
    const { error } = await loaded.current.elements.submit()
    return !error
  }

  /** Charges the card for the PaymentIntent behind `clientSecret`. */
  async function confirm(clientSecret: string, billing: BillingDetails, returnUrl: string): Promise<Confirmation> {
    if (!loaded.current) return { kind: 'notPaid', message: null }
    const { stripe, elements } = loaded.current
    const { address } = billing
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      redirect: 'if_required',
      confirmParams: {
        return_url: returnUrl,
        payment_method_data: {
          billing_details: {
            name: billing.name,
            email: billing.email,
            phone: billing.phone,
            address: { line1: address.line1, line2: address.line2, city: address.city, postal_code: address.postalCode, country: address.country, state: '' },
          },
        },
      },
    })
    if (error) {
      // Card and form errors are written for the visitor, in the page's language; others are not.
      const forVisitor = error.type === 'card_error' || error.type === 'validation_error'
      return { kind: 'notPaid', message: forVisitor && error.message ? error.message : null }
    }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      return { kind: 'paid', paymentIntentId: paymentIntent.id }
    }
    return { kind: 'notPaid', message: null }
  }

  return { mountRef, state, submit, confirm }
}
