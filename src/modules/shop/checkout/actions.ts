'use server'

import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { z } from 'zod'

import { readCartRef } from '../cart/cookie'
import { findGuestCart, priceGuestCart } from '../cart/load'
import { shopConfig } from '../config'
import { startStripePayment } from '../payments/stripe/payments'
import { checkDetails, type DetailField, type FieldProblem, toPaymentAddress } from './details'

// The checkout's Server Action: starts the payment on the server, for the cart in the visitor's
// cookie (never cart data from the browser). Anyone can call it with anything, so the details are
// checked here again, and the amount comes from the cart's price today (the Stripe wrapper's
// rules). The browser only says which total it showed: a cart that costs anything else now is
// sent back to the cart page, never charged.

export type StartPaymentResult =
  /** Stripe's form confirms the payment with this. */
  | { ok: true; clientSecret: string }
  | { ok: false; problem: 'invalid'; fields: Partial<Record<DetailField, FieldProblem>> }
  /** The cart is gone, can't be bought as it is (stock, a product off sale), or costs another total. */
  | { ok: false; problem: 'cartChanged' }
  | { ok: false; problem: 'failed' }

const input = z.object({ details: z.record(z.string(), z.unknown()), expectedTotal: z.number().int().min(0) })

const cartChanged: StartPaymentResult = { ok: false, problem: 'cartChanged' }
const failed: StartPaymentResult = { ok: false, problem: 'failed' }

/** Starts the payment of the visitor's cart: details checked, cart priced, PaymentIntent created. */
export async function startPayment(raw: { details: Record<string, unknown>; expectedTotal: number }): Promise<StartPaymentResult> {
  const parsed = input.safeParse(raw)
  if (!parsed.success) return failed
  const checked = checkDetails(parsed.data.details, shopConfig().shipping)
  if (!checked.ok) return { ok: false, problem: 'invalid', fields: checked.problems }
  const { details } = checked
  const { expectedTotal } = parsed.data

  let payload: Payload | undefined
  try {
    payload = await getPayload({ config })
    const ref = await readCartRef()
    const cart = ref ? await findGuestCart(payload, ref) : null
    if (!ref || !cart) return cartChanged
    // Checked here first for a clear answer; the wrapper checks again as it charges.
    const pricing = await priceGuestCart(payload, cart)
    if (!pricing.canCheckout || pricing.total !== expectedTotal) return cartChanged

    const started = await startStripePayment(payload, { cart: ref, customerEmail: details.email, address: toPaymentAddress(details), expectedTotal })
    if (started.ok) return { ok: true, clientSecret: started.clientSecret }
    if (started.reason === 'cartChanged') return cartChanged
    // The plugin checks stock itself before the wrapper runs, and answers 400: a unit sold meanwhile.
    const now = await findGuestCart(payload, ref)
    if (!now || !(await priceGuestCart(payload, now)).canCheckout) return cartChanged
    payload.logger.error({ msg: `Shop: the payment could not start (${started.status}): ${started.message ?? 'no message'}` })
    return failed
  } catch (error) {
    if (payload) payload.logger.error({ err: error, msg: 'Shop: the payment could not start' })
    else console.error('Shop: the payment could not start', error)
    return failed
  }
}
