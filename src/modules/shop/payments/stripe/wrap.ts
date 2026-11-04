import { randomBytes } from 'node:crypto'

import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'
import type { PayloadRequest } from 'payload'

import type { Locale } from '@/core/i18n/locales'

import { priceGuestCart } from '../../cart/load'
import type { CartPricing } from '../../cart/price'
import { checkDetails, toPaymentAddress } from '../../checkout/details'
import type { LinePrice } from '../../collections/breakdown'
import { buyerLocale } from '../../collections/locale'
import { shopConfig } from '../../config'
import { clampOversold, stockShortfalls } from '../../orders/stock'
import { lineSnapshot, STRIPE_METADATA_LIMIT } from './metadata'

// The wrapper around the ecommerce plugin's Stripe adapter (plan, "Cart (S16)", "Checkout (S17)"
// and "Orders"). The built-in `initiatePayment` charges whatever `data.cart.subtotal` it is
// handed: the cart's stored subtotal, which the plugin wrote at the last cart change. That goes
// stale after a price change, counts a line whose price was switched off, has no shipping, and
// holds whatever a broken write left there. So, before the inner adapter runs:
//
// - Payments start from the checkout only. The plugin's `initiate` endpoint is public
//   (`POST /api/payments/stripe/initiate`), and a request over HTTP has no checkout context
//   (`req.context` starts empty), so it is refused: the checkout's rules can't be skipped.
// - The email and the shipping address must pass the checkout's own check (`checkDetails`: a
//   country the shop ships to, every required field). The inner adapter gets them as checked,
//   and the shipping address as the billing address too.
// - The cart is priced again with `priceGuestCart`: its products as visitors read them now, at
//   today's stored prices, plus `calculateShipping` (the same rules as the cart page). It is
//   refused unless it can check out (empty, a line no longer for sale or gone, sold out, over
//   the stock across its lines, a bad quantity), and, when the checkout passed the total it
//   showed the visitor, unless that total is still the one charged.
// - Each attempt hands the inner adapter fresh line ids. The plugin copies the lines, ids
//   included, into the transaction's lines, whose ids are a primary key: with the cart's own ids,
//   every attempt after the first on one cart would fail (and leave a half-written transaction).
//   The PaymentIntent's snapshot and the transaction share the fresh ids, so the plugin's
//   settlement check still matches them.
// - The lines must fit in one Stripe metadata value (`lineSnapshot`, 500 characters): refused
//   before any call to Stripe otherwise.
// - The inner adapter is handed `total` as the subtotal, so that is what the PaymentIntent charges.
//
// Afterwards the transaction gets `subtotal`, `shippingAmount` (subtotal + shippingAmount ===
// amount), `linePrices` and the checkout's `locale`, and the update must have matched exactly one
// transaction.
//
// `confirmOrder` (S18) settles a payment, whoever asks: the browser's return and the webhook both
// go through `finalizePayment` (orders/finalizePayment.ts) and the plugin's `confirm-order`, which
// claims the transaction atomically, so one payment makes one order. The wrapper hands the
// plugin's `finalizeOrder` the order's extra data: the breakdown, line prices and language copied
// from the transaction, and a note when the stock left can't cover the order (orders/stock.ts).
// After the order exists, the call that created it (and only that one: a late or losing call gets
// the same order back, made by another) sets any stock below 0 back to 0, without ever throwing.

/** The key in `req.context` where the checkout and the wrapper meet. */
export const CHECKOUT_CONTEXT = 'lightCheckout'

/**
 * Why the wrapper refused a payment:
 * - `notFromCheckout`: no checkout context (a direct call to the plugin's endpoint);
 * - `badAddress`: the email or the shipping address doesn't pass the checkout's check;
 * - `cartChanged`: the cart can't be bought as it is, or costs another total than the one shown;
 * - `tooManyLines`: the lines don't fit in Stripe's metadata.
 */
export type PaymentRefusal = 'notFromCheckout' | 'badAddress' | 'cartChanged' | 'tooManyLines'

export type CheckoutContext = {
  /** The total the visitor was shown, in cents. When set, any other total is refused, never charged. */
  expectedTotal?: number
  /**
   * Set by the wrapper when it refuses a payment. The plugin's endpoint answers a bare 500 for
   * anything the adapter throws, so this is how the checkout learns why.
   */
  refused?: PaymentRefusal
  /** The checkout's language, stored on the transaction and copied onto the order (S19's emails). */
  locale?: Locale
}

/** The checkout's context on this request, or `null` when the request did not come from the checkout. */
function existingContext(req: Pick<PayloadRequest, 'context'>): CheckoutContext | null {
  const context = req.context?.[CHECKOUT_CONTEXT]
  return context && typeof context === 'object' ? (context as CheckoutContext) : null
}

/** The checkout's context on this request, created when missing (the checkout's side). */
export function checkoutContext(req: Pick<PayloadRequest, 'context'>): CheckoutContext {
  const existing = existingContext(req)
  if (existing) return existing
  const created: CheckoutContext = {}
  req.context[CHECKOUT_CONTEXT] = created
  return created
}

/** A payment the wrapper would not start. Nothing was charged and no PaymentIntent exists. */
export class PaymentRefusedError extends Error {
  override name = 'PaymentRefusedError'
}

/** A fresh id for a line: 12 random bytes as 24 hex characters, the shape of the ids Payload makes. */
const freshLineId = () => randomBytes(12).toString('hex')

/** Wraps a payment adapter with the checkout's rules (see above). */
export function withCheckoutRules(inner: PaymentAdapter): PaymentAdapter {
  return {
    ...inner,
    initiatePayment: async (args) => {
      const { req, data } = args
      const context = existingContext(req)
      if (!context) throw new PaymentRefusedError('Payments start from the checkout only: this request has no checkout context.')
      const cartId = String(data.cart.id)
      const refuse = (reason: PaymentRefusal, why: string): never => {
        context.refused = reason
        throw new PaymentRefusedError(`Cart ${cartId}: ${why}`)
      }

      const address = data.shippingAddress && typeof data.shippingAddress === 'object' ? data.shippingAddress : {}
      const checked = checkDetails({ ...address, email: data.customerEmail }, shopConfig().shipping)
      if (!checked.ok) refuse('badAddress', `the email or the shipping address is not valid (${Object.keys(checked.problems).join(', ')}).`)
      const { details } = checked as Extract<typeof checked, { ok: true }>
      const shippingAddress = toPaymentAddress(details) as typeof data.shippingAddress

      const pricing = await priceGuestCart(req.payload, data.cart)
      if (!pricing.canCheckout) refuse('cartChanged', 'it cannot check out as it is.')
      if (context.expectedTotal !== undefined && context.expectedTotal !== pricing.total) {
        refuse('cartChanged', `it now costs ${pricing.total}, not the ${context.expectedTotal} shown.`)
      }

      const items = data.cart.items.map((item) => ({ ...item, id: freshLineId() }))
      if (lineSnapshot(items).length > STRIPE_METADATA_LIMIT) {
        refuse('tooManyLines', `its ${items.length} lines don't fit in one Stripe metadata value.`)
      }

      const result = await inner.initiatePayment({
        ...args,
        data: {
          ...data,
          customerEmail: details.email,
          shippingAddress,
          billingAddress: shippingAddress!,
          cart: { ...data.cart, items, subtotal: pricing.total },
        },
      })
      await storeBreakdown(req, result.paymentIntentID, pricing, context.locale)
      return result
    },

    confirmOrder: (args) =>
      inner.confirmOrder({
        ...args,
        // Called once per `confirm-order`, after the inner adapter checked the payment at Stripe.
        finalizeOrder: async ({ orderData, transactionID }) => {
          const { req } = args
          // Before the plugin claims the transaction: reads only, so a throw leaves it pending.
          const transaction = await req.payload.findByID({ collection: 'transactions', id: transactionID as number, depth: 0, overrideAccess: true, disableErrors: true, req })
          const lines = transaction?.items ?? []
          const shortfalls = await stockShortfalls(req, lines)
          // Only the call whose data the plugin used to create the order gets its key back.
          const settlementKey = randomBytes(12).toString('hex')
          const order = await args.finalizeOrder({
            transactionID,
            orderData: {
              ...orderData,
              settlementKey,
              subtotal: transaction?.subtotal ?? null,
              shippingAmount: transaction?.shippingAmount ?? null,
              linePrices: transaction?.linePrices ?? null,
              locale: buyerLocale(transaction?.locale),
              ...(shortfalls.length ? { needsAttention: true, attentionNote: shortfalls.join('\n') } : {}),
            },
          })
          // The order exists: from here on nothing may throw.
          if (order.settlementKey === settlementKey) await clampOversold(req, lines, order)
          return order
        },
      }),
  }
}

/** Each line's price as charged (the cart could check out, so every line has one). */
const linePricesOf = (pricing: CartPricing): LinePrice[] =>
  pricing.lines.map((line) => ({ product: line.productId ?? '', quantity: line.quantity, unitPrice: line.unitPrice ?? 0, lineTotal: line.lineTotal ?? 0 }))

/** Writes the breakdown, line prices and language on the payment's transaction, which must be exactly one. */
async function storeBreakdown(req: PayloadRequest, paymentIntentID: unknown, pricing: CartPricing, locale: Locale | undefined): Promise<void> {
  if (typeof paymentIntentID !== 'string' || !paymentIntentID) {
    throw new Error('The Stripe adapter returned no PaymentIntent ID.')
  }
  // Transactions are read-only for everyone (collections/Transactions.ts): trusted server code.
  const { docs, errors } = await req.payload.update({
    collection: 'transactions',
    where: { 'stripe.paymentIntentID': { equals: paymentIntentID } },
    data: { subtotal: pricing.subtotal, shippingAmount: pricing.shipping, linePrices: linePricesOf(pricing), locale: locale ?? null },
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (docs.length !== 1 || errors.length > 0) {
    throw new Error(`Expected one transaction for PaymentIntent ${paymentIntentID}, updated ${docs.length}.`)
  }
}
