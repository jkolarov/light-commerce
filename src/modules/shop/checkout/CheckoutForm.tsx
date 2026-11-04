'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { type FormEvent, useRef, useState } from 'react'

import type { ShopConfig } from '@/config/schema'
import type { Locale } from '@/core/i18n/locales'
import { Button, cx, Heading } from '@/theme'

import { formatMoney } from '../money'
import { type BillingDetails, type PaymentElementSettings, usePaymentElement } from '../payments/stripe/usePaymentElement'
import { startPayment } from './actions'
import { CheckoutField, inputClass } from './CheckoutField'
import { type CheckoutDetails, checkDetails, type DetailField, DETAIL_FIELDS, type FieldProblem, MAX_LENGTH } from './details'
import { cartChangedPath, checkoutReturnPath } from './paths'

type Props = {
  locale: Locale
  /** Cents: the total the summary shows. The server charges the cart's own, and refuses another. */
  total: number
  currency: string
  shipping: ShopConfig['shipping']
  /** `shipping.countries`, with their names in the page's language. */
  countries: { code: string; name: string }[]
  publishableKey: string
  appearance: PaymentElementSettings['appearance']
  /** The visitor came back from a payment that did not go through. */
  paymentFailed: boolean
}

type Problems = Partial<Record<DetailField, FieldProblem>>

const fieldId = (field: DetailField) => `checkout-${field}`

const section = 'border-t border-text/15 pt-8'
const sectionHeading = 'mb-5'

/**
 * The checkout form: contact, shipping address, then Stripe's card form and the Pay button with
 * the amount. Paying: the details are checked (here, then on the server), Stripe checks the card
 * fields, the server starts the payment for the cart in the cookie, and Stripe charges the card.
 * Then the browser goes to the return path, which confirms the order.
 */
export function CheckoutForm({ locale, total, currency, shipping, countries, publishableKey, appearance, paymentFailed }: Props) {
  const t = useTranslations('checkout')
  const router = useRouter()
  const { mountRef, state: paymentState, submit, confirm } = usePaymentElement({ publishableKey, amount: total, currency, locale, appearance })
  const [values, setValues] = useState<CheckoutDetails>(() => ({
    ...(Object.fromEntries(DETAIL_FIELDS.map((field) => [field, ''])) as CheckoutDetails),
    country: countries[0]?.code ?? '',
  }))
  const [problems, setProblems] = useState<Problems>({})
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  // The payment started for these details, reused when the visitor tries again (a declined card).
  const started = useRef<{ key: string; clientSecret: string } | null>(null)

  const problemText = (field: DetailField, problem: FieldProblem | undefined): string | null => {
    switch (problem) {
      case undefined:
        return null
      case 'required':
        return t('errors.required')
      case 'tooLong':
        return t('errors.tooLong', { max: MAX_LENGTH[field] })
      case 'notShipped':
        return t('errors.notShipped')
      case 'invalid':
        return field === 'email' || field === 'phone' || field === 'postalCode' ? t(`errors.${field}`) : t('errors.invalid')
    }
  }

  const change = (field: DetailField, value: string) => {
    const next = { ...values, [field]: value }
    setValues(next)
    // Once the visitor tried to pay, problems clear (and show) as they type.
    if (checked) {
      const result = checkDetails(next, shipping)
      setProblems(result.ok ? {} : result.problems)
    }
  }

  const showProblems = (found: Problems) => {
    setProblems(found)
    const first = DETAIL_FIELDS.find((field) => found[field])
    if (first) document.getElementById(fieldId(first))?.focus()
  }

  async function pay(event: FormEvent) {
    event.preventDefault()
    if (busy || paymentState !== 'ready') return
    setChecked(true)
    setPaymentError(null)
    const result = checkDetails(values, shipping)
    if (!result.ok) return showProblems(result.problems)
    setProblems({})

    setBusy(true)
    let leaving = false
    try {
      // Stripe shows what is missing in its own fields.
      if (!(await submit())) return
      const key = JSON.stringify(result.details)
      let clientSecret = started.current?.key === key ? started.current.clientSecret : null
      if (!clientSecret) {
        const start = await startPayment({ details: result.details, expectedTotal: total, locale })
        if (!start.ok) {
          if (start.problem === 'cartChanged') {
            leaving = true
            router.push(cartChangedPath(locale))
          } else if (start.problem === 'invalid') showProblems(start.fields)
          else setPaymentError(t(start.problem === 'tooManyLines' ? 'tooManyLines' : 'failed'))
          return
        }
        clientSecret = start.clientSecret
        started.current = { key, clientSecret }
      }
      const returnPath = checkoutReturnPath(locale)
      const outcome = await confirm(clientSecret, billingOf(result.details), new URL(returnPath, window.location.origin).href)
      if (outcome.kind === 'paid') {
        leaving = true
        // The return path is a route handler that redirects, not a page: a full navigation.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`${returnPath}?payment_intent=${encodeURIComponent(outcome.paymentIntentId)}`)
        return
      }
      setPaymentError(outcome.message ?? t('notPaid'))
    } catch {
      setPaymentError(t('failed'))
    } finally {
      if (!leaving) setBusy(false)
    }
  }

  const field = (name: DetailField, props: { autoComplete: string; type?: string; optional?: boolean; hint?: string; className?: string }) => (
    <CheckoutField
      id={fieldId(name)}
      name={name}
      label={t(name)}
      optionalLabel={props.optional ? t('optional') : undefined}
      hint={props.hint}
      error={problemText(name, problems[name])}
      className={props.className}
      type={props.type ?? 'text'}
      autoComplete={props.autoComplete}
      required={!props.optional}
      maxLength={MAX_LENGTH[name]}
      spellCheck={props.type === 'email' ? false : undefined}
      value={values[name]}
      onChange={(event) => change(name, event.target.value)}
    />
  )

  const hasProblems = Object.keys(problems).length > 0

  return (
    <form noValidate onSubmit={pay} aria-busy={busy || undefined}>
      {paymentFailed && !paymentError && (
        <div role="alert" className="mb-8 border-l-[3px] border-[var(--lc-checkout-danger)] bg-surface px-5 py-4">
          <p className="font-semibold text-text">{t('paymentFailed')}</p>
          <p className="mt-0.5 text-[0.9375rem] text-text">{t('paymentFailedHint')}</p>
        </div>
      )}
      <p aria-live="polite" className={cx('text-[0.9375rem] text-[var(--lc-checkout-danger)]', hasProblems && 'mb-6')}>
        {hasProblems ? t('fixFields') : null}
      </p>

      <fieldset disabled={busy} className="min-w-0 space-y-10">
        <section aria-labelledby="checkout-contact" className={section}>
          <Heading level={2} size="title" id="checkout-contact" className={sectionHeading}>
            {t('contact')}
          </Heading>
          <div className="space-y-5">
            {field('email', { type: 'email', autoComplete: 'email', hint: t('emailHint') })}
            {field('phone', { type: 'tel', autoComplete: 'tel', optional: true })}
          </div>
        </section>

        <section aria-labelledby="checkout-shipping" className={section}>
          <Heading level={2} size="title" id="checkout-shipping" className={sectionHeading}>
            {t('shippingAddress')}
          </Heading>
          <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
            {field('firstName', { autoComplete: 'shipping given-name' })}
            {field('lastName', { autoComplete: 'shipping family-name' })}
            {field('addressLine1', { autoComplete: 'shipping address-line1', className: 'sm:col-span-2' })}
            {field('addressLine2', { autoComplete: 'shipping address-line2', optional: true, className: 'sm:col-span-2' })}
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-5 sm:col-span-2">
              {field('postalCode', { autoComplete: 'shipping postal-code' })}
              {field('city', { autoComplete: 'shipping address-level2' })}
            </div>
            <CheckoutField id={fieldId('country')} label={t('country')} error={problemText('country', problems.country)} className="sm:col-span-2">
              {(describedBy) => (
                <select
                  id={fieldId('country')}
                  name="country"
                  autoComplete="shipping country"
                  required
                  value={values.country}
                  onChange={(event) => change('country', event.target.value)}
                  aria-invalid={problems.country ? true : undefined}
                  aria-describedby={describedBy}
                  className={inputClass}
                >
                  {countries.map(({ code, name }) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </CheckoutField>
          </div>
        </section>
      </fieldset>

      <section aria-labelledby="checkout-payment" className={cx(section, 'mt-10')}>
        <Heading level={2} size="title" id="checkout-payment" className={sectionHeading}>
          {t('payment')}
        </Heading>
        {paymentState === 'loading' && <p className="text-muted">{t('paymentLoading')}</p>}
        {paymentState === 'unavailable' && <p className="text-text">{t('paymentUnavailable')}</p>}
        {/* Stripe draws its card form in here, in its own iframe. */}
        <div ref={mountRef} />

        {/* Stripe also shows a card's problem at the card field; this one is by the button, and read out. */}
        <div role="alert" className="mt-5 empty:hidden">
          {paymentError && (
            <>
              <p className="text-[var(--lc-checkout-danger)]">{paymentError}</p>
              <p className="mt-0.5 text-[0.9375rem] text-text">{t('notChargedHint')}</p>
            </>
          )}
        </div>

        <Button
          type="submit"
          className="mt-6 w-full text-base aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          aria-disabled={busy || paymentState !== 'ready' || undefined}
        >
          {busy ? t('processing') : t('pay', { amount: formatMoney(total, { currency, locale }) })}
        </Button>
        <p className="mt-4 text-[0.9375rem] leading-snug text-muted">{t('paymentBy')}</p>
      </section>
    </form>
  )
}

/** The card's billing details: the shipping address (Stripe's form asks only for the card). */
function billingOf(details: CheckoutDetails): BillingDetails {
  return {
    name: `${details.firstName} ${details.lastName}`,
    email: details.email,
    phone: details.phone,
    address: { line1: details.addressLine1, line2: details.addressLine2, city: details.city, postalCode: details.postalCode, country: details.country },
  }
}
