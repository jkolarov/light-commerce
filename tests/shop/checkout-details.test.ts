import { describe, expect, it } from 'vitest'

import { checkDetails, MAX_LENGTH, toPaymentAddress } from '@/modules/shop/checkout/details'
import { STRIPE_METADATA_LIMIT } from '@/modules/shop/payments/stripe/metadata'

// The visitor's contact and shipping details: the same rules in the form and on the server.

const shipping = { flatRate: 490, countries: ['FR', 'BE'] }

const valid = {
  email: '  camille@example.com ',
  firstName: 'Camille',
  lastName: 'Dupré',
  phone: '',
  addressLine1: '12 rue des Claies',
  addressLine2: '',
  postalCode: '26110',
  city: 'Nyons',
  country: 'FR',
}

describe('checkout details', () => {
  it('accepts a complete address, trimmed, and leaves the optional fields out when empty', () => {
    const checked = checkDetails(valid, shipping)
    expect(checked).toEqual({ ok: true, details: { ...valid, email: 'camille@example.com' } })
    if (!checked.ok) return
    expect(toPaymentAddress(checked.details)).toEqual({
      firstName: 'Camille',
      lastName: 'Dupré',
      addressLine1: '12 rue des Claies',
      postalCode: '26110',
      city: 'Nyons',
      country: 'FR',
    })
    const withOptional = checkDetails({ ...valid, phone: '+33 6 12 34 56 78', addressLine2: 'Bâtiment B' }, shipping)
    expect(withOptional.ok && toPaymentAddress(withOptional.details)).toMatchObject({ phone: '+33 6 12 34 56 78', addressLine2: 'Bâtiment B' })
  })

  it('names every missing required field', () => {
    const checked = checkDetails({}, shipping)
    expect(checked).toEqual({
      ok: false,
      problems: { email: 'required', firstName: 'required', lastName: 'required', addressLine1: 'required', postalCode: 'required', city: 'required', country: 'required' },
    })
  })

  it('ships only to the countries of shop.shipping.countries: upper-case ISO codes, exact match', () => {
    for (const country of ['DE', 'fr', 'France', 'FRA']) {
      expect(checkDetails({ ...valid, country }, shipping)).toEqual({ ok: false, problems: { country: 'notShipped' } })
    }
    expect(checkDetails({ ...valid, country: 'BE' }, shipping).ok).toBe(true)
  })

  it('refuses a malformed email, phone or postal code', () => {
    expect(checkDetails({ ...valid, email: 'camille@' }, shipping)).toEqual({ ok: false, problems: { email: 'invalid' } })
    expect(checkDetails({ ...valid, phone: 'call me' }, shipping)).toEqual({ ok: false, problems: { phone: 'invalid' } })
    expect(checkDetails({ ...valid, phone: '12' }, shipping)).toEqual({ ok: false, problems: { phone: 'invalid' } })
    expect(checkDetails({ ...valid, postalCode: '26<110>' }, shipping)).toEqual({ ok: false, problems: { postalCode: 'invalid' } })
  })

  it('refuses control characters, and anything that is not text', () => {
    expect(checkDetails({ ...valid, city: 'Nyons\u0000' }, shipping)).toEqual({ ok: false, problems: { city: 'invalid' } })
    expect(checkDetails({ ...valid, firstName: { $ne: '' } }, shipping)).toEqual({ ok: false, problems: { firstName: 'required' } })
    expect(checkDetails(null, shipping).ok).toBe(false)
  })

  it('caps each field, so the address always fits in Stripe’s metadata', () => {
    expect(checkDetails({ ...valid, city: 'x'.repeat(MAX_LENGTH.city + 1) }, shipping)).toEqual({ ok: false, problems: { city: 'tooLong' } })
    // The longest address the rules let through, with characters JSON writes as two.
    const longest = checkDetails(
      {
        ...valid,
        firstName: '"'.repeat(MAX_LENGTH.firstName),
        lastName: 'é'.repeat(MAX_LENGTH.lastName),
        phone: '+' + '1'.repeat(MAX_LENGTH.phone - 1),
        addressLine1: '\\'.repeat(MAX_LENGTH.addressLine1),
        addressLine2: 'x'.repeat(MAX_LENGTH.addressLine2),
        postalCode: '1'.repeat(MAX_LENGTH.postalCode),
        city: 'x'.repeat(MAX_LENGTH.city),
      },
      shipping,
    )
    if (longest.ok) expect(JSON.stringify(toPaymentAddress(longest.details)).length).toBeLessThanOrEqual(STRIPE_METADATA_LIMIT)
    else expect(Object.values(longest.problems)).toContain('tooLong')
    const plain = checkDetails(
      { ...valid, ...Object.fromEntries(['firstName', 'lastName', 'addressLine1', 'addressLine2', 'city'].map((key) => [key, 'x'.repeat(MAX_LENGTH[key as keyof typeof MAX_LENGTH])])) },
      shipping,
    )
    expect(plain.ok).toBe(true)
  })
})
