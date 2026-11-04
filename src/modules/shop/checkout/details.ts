import type { ShopConfig } from '@/config/schema'

import type { PaymentAddress } from '../payments/stripe/payments'
import { isShippingCountry } from '../shipping/calculate'

// What the checkout asks the visitor for (contact and shipping address), and the rules it is
// checked against. Pure, so the form checks it as the visitor goes, with the same messages, and
// the Server Action checks it again before a payment starts (anyone can call it with anything).

export type CheckoutDetails = {
  email: string
  firstName: string
  lastName: string
  /** `''` when not given. */
  phone: string
  addressLine1: string
  /** `''` when not given. */
  addressLine2: string
  postalCode: string
  city: string
  /** ISO 3166-1 alpha-2, capitals: one of `shop.shipping.countries`. */
  country: string
}

export type DetailField = keyof CheckoutDetails

/** The form's fields, in order. */
export const DETAIL_FIELDS = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'addressLine1',
  'addressLine2',
  'postalCode',
  'city',
  'country',
] as const satisfies readonly DetailField[]

export const OPTIONAL_FIELDS: ReadonlySet<DetailField> = new Set(['phone', 'addressLine2'])

/** Why a field was refused. `notShipped`: the shop doesn't deliver to that country. */
export type FieldProblem = 'required' | 'invalid' | 'tooLong' | 'notShipped'

/**
 * Stripe keeps the shipping address in the PaymentIntent's metadata, where a value holds at most
 * 500 characters (the ecommerce plugin stores it there as JSON, and the order reads it back).
 */
export const STRIPE_METADATA_LIMIT = 500

/**
 * The most characters each field may hold. The address fields add up to well under
 * `STRIPE_METADATA_LIMIT` once written as JSON; a final check covers characters JSON escapes.
 */
export const MAX_LENGTH: Record<DetailField, number> = {
  email: 254,
  firstName: 50,
  lastName: 50,
  phone: 20,
  addressLine1: 70,
  addressLine2: 70,
  postalCode: 10,
  city: 50,
  country: 2,
}

const CONTROL = /\p{Cc}/u
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
/** Digits, spaces and + ( ) . -, with at least 6 digits. */
const PHONE = /^\+?[\d ().-]+$/
/** Letters, digits, spaces and hyphens: postal codes the world over. */
const POSTAL_CODE = /^[\p{L}\d][\p{L}\d -]*$/u

const fieldRules: Partial<Record<DetailField, (value: string) => boolean>> = {
  email: (value) => EMAIL.test(value),
  phone: (value) => PHONE.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6,
  postalCode: (value) => POSTAL_CODE.test(value),
}

export type DetailsCheck =
  | { ok: true; details: CheckoutDetails }
  | { ok: false; problems: Partial<Record<DetailField, FieldProblem>> }

/** Checks the details the form sent (anything at all), trimmed. */
export function checkDetails(input: unknown, shipping: ShopConfig['shipping']): DetailsCheck {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const details = {} as CheckoutDetails
  const problems: Partial<Record<DetailField, FieldProblem>> = {}

  for (const field of DETAIL_FIELDS) {
    const value = typeof raw[field] === 'string' ? raw[field].trim() : ''
    details[field] = value
    if (!value) {
      if (!OPTIONAL_FIELDS.has(field)) problems[field] = 'required'
    } else if (value.length > MAX_LENGTH[field] && field !== 'country') {
      problems[field] = 'tooLong'
    } else if (CONTROL.test(value) || fieldRules[field]?.(value) === false) {
      problems[field] = 'invalid'
    } else if (field === 'country' && !isShippingCountry(value, shipping)) {
      problems[field] = 'notShipped'
    }
  }

  if (Object.keys(problems).length > 0) return { ok: false, problems }
  if (JSON.stringify(toPaymentAddress(details)).length > STRIPE_METADATA_LIMIT) {
    return { ok: false, problems: { addressLine1: 'tooLong' } }
  }
  return { ok: true, details }
}

/** The shipping address for the payment, in the ecommerce plugin's address fields. */
export function toPaymentAddress(details: CheckoutDetails): PaymentAddress {
  return {
    firstName: details.firstName,
    lastName: details.lastName,
    addressLine1: details.addressLine1,
    ...(details.addressLine2 ? { addressLine2: details.addressLine2 } : {}),
    postalCode: details.postalCode,
    city: details.city,
    country: details.country,
    ...(details.phone ? { phone: details.phone } : {}),
  }
}
