import type { Payload } from 'payload'

import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import type { Order, Product } from '@/payload-types'

import { productIdOf } from '../cart/rules'
import { readLinePrices } from '../collections/breakdown'
import { buyerLocale } from '../collections/locale'
import { emailTranslator } from './messages'
import { renderOrderConfirmation } from './orderConfirmation'
import { renderOwnerNotification } from './ownerNotification'

// Sends an order's two emails, once per order (S19): the buyer's confirmation, in the language
// they checked out in, and the owner's notification, in the default language.
//
// - Once: `finalizePayment`'s seam runs for every path that returns the order (the browser's
//   return, Stripe's webhook and its retries, the reconcile job), sometimes at the same moment,
//   and there are no database transactions. So the order is claimed first with one conditional
//   update, `SET confirmationEmailSentAt = now WHERE id = ? AND confirmationEmailSentAt IS NULL`,
//   and only the call whose update matched sends.
// - At most once: a send that fails is not retried. Its claim stays, the error is logged, and the
//   order is flagged for the owner (`needsAttention` and a note, in the default language), who
//   sees it in the admin's order list. Releasing the claim instead would buy little (after a
//   settlement Stripe gets a 200 and sends no more, and the reconcile job leaves settled payments
//   alone) and could send a buyer the same email twice: a timeout can come after the server took it.
//   A server stopped hard before the claim leaves the order unclaimed: the nightly sweep
//   (./missed.ts) sends those. One stopped after the claim, mid-send, looks sent: at most once.
// - Never fails the order: this runs after the settlement, and catches everything. The buyer's
//   confirmation goes first, so the owner's notification can say it failed.

/** Claims the order's emails: `true` for the one call that set `confirmationEmailSentAt`. */
async function claim(payload: Payload, orderId: number): Promise<boolean> {
  const claimed = await payload.db.updateOne({
    collection: 'orders',
    where: { and: [{ id: { equals: orderId } }, { confirmationEmailSentAt: { exists: false } }] },
    data: { confirmationEmailSentAt: new Date().toISOString() },
    options: { atomic: true },
  })
  return Boolean(claimed)
}

/**
 * The order with its products' names in `locale`, on its lines (`items[].product`), as the
 * renderers read them. Products moved to the trash still name their line; a product deleted for
 * good leaves the line without a name. A line charged but missing from `items` (a settlement
 * interrupted after the order was created; the reconcile job recovers it) is added to `items` with
 * its product, so the renderers, which list the lines as charged (`linePrices`), can name it too.
 */
async function withProductNames(payload: Payload, order: Order, locale: Locale): Promise<Order> {
  const charged = readLinePrices(order.linePrices)
  const ids = [...new Set([...(order.items ?? []).map((item) => productIdOf(item.product)), ...charged.map((line) => String(line.product))])].filter(
    (id): id is string => Boolean(id),
  )
  if (!ids.length) return order
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    locale,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    trash: true,
    select: { title: true },
  })
  const products = new Map(docs.map((doc) => [String(doc.id), doc as Product]))
  const items = (order.items ?? []).map((item) => {
    const id = productIdOf(item.product)
    return { ...item, product: (id && products.get(id)) || item.product }
  })
  const listed = new Set(items.map((item) => productIdOf(item.product)))
  const missing = charged.flatMap((line) => {
    const product = listed.has(String(line.product)) ? undefined : products.get(String(line.product))
    return product ? [{ product, quantity: line.quantity }] : []
  })
  return { ...order, items: [...items, ...missing] }
}

/** Adds `notes` to the order's note and flags it. No hooks, no validation: like the stock notes. */
async function flag(payload: Payload, orderId: number, notes: string[]): Promise<void> {
  try {
    const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true, select: { attentionNote: true } })
    const attentionNote = [order.attentionNote, ...notes].filter(Boolean).join('\n')
    await payload.db.updateOne({ collection: 'orders', id: orderId, data: { needsAttention: true, attentionNote } })
  } catch (error) {
    payload.logger.error({ err: error, msg: `Shop: could not flag order ${orderId} after its emails failed.` })
  }
}

/** Sends `email`; `false` (logged) when the transport refused it or anything else went wrong. */
async function trySend(payload: Payload, orderId: number, what: string, email: () => Parameters<Payload['sendEmail']>[0]): Promise<boolean> {
  try {
    await payload.sendEmail(email())
    return true
  } catch (error) {
    payload.logger.error({ err: error, msg: `Shop: order ${orderId}: the ${what} email could not be sent.` })
    return false
  }
}

/** Sends the order's emails unless another call already did (see above). Never throws. */
export async function sendOrderEmails(payload: Payload, orderId: number): Promise<void> {
  let claimed = false
  try {
    claimed = await claim(payload, orderId)
    if (!claimed) return
    const { site, email, locales } = getLightConfig()
    const notes = emailTranslator(locales.default)
    const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })

    const stored = buyerLocale(order.locale)
    const language = stored && locales.available.includes(stored) ? stored : locales.default
    const buyer = order.customerEmail?.trim()
    const problems: string[] = []
    if (!buyer) problems.push(notes('notes.noBuyerEmail'))
    else {
      const named = await withProductNames(payload, order, language)
      const sent = await trySend(payload, orderId, 'confirmation', () => ({ to: buyer, replyTo: site.contactEmail, ...renderOrderConfirmation(named, language) }))
      if (!sent) problems.push(notes('notes.confirmationFailed', { email: buyer }))
    }
    if (problems.length) await flag(payload, orderId, problems)

    // Read again: the notification says what needs attention, this email's failure included.
    const current = problems.length ? await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true }) : order
    const named = await withProductNames(payload, current, locales.default)
    const notified = await trySend(payload, orderId, 'owner notification', () => ({
      to: email.ownerNotificationsTo,
      ...(buyer ? { replyTo: buyer } : {}),
      ...renderOwnerNotification(named, { adminRoute: payload.config.routes.admin }),
    }))
    if (!notified) await flag(payload, orderId, [notes('notes.notificationFailed')])
    if (!problems.length && notified) payload.logger.info({ msg: `Shop: order ${orderId}: confirmation sent to the buyer, notification to ${email.ownerNotificationsTo}.` })
  } catch (error) {
    payload.logger.error({ err: error, msg: `Shop: order ${orderId}: the order emails failed${claimed ? '' : ' before they were claimed'}.` })
    if (claimed) await flag(payload, orderId, [emailTranslator(getLightConfig().locales.default)('notes.sendingFailed')])
  }
}
