import type { PayloadRequest } from 'payload'

import { productIdOf } from '../cart/rules'

// Stock at settlement (plan, "Orders", Review focus #3). The plugin lowers stock with a raw `$inc`
// that skips `min: 0` and every hook, and `confirm-order` doesn't check stock (only `initiate`
// does, and a retry that reuses a started payment skips even that). A paid order is always
// created; what stock can't cover is flagged for the owner instead:
//
// - before the order is created, `stockShortfalls` compares each line with the stock left, and
//   the wrapper puts a note in the new order (`needsAttention`, `attentionNote`);
// - after, `clampOversold` sets every stock below 0 back to 0 with one conditional, atomic update
//   (`WHERE inventory < 0`), never a read then a write, and flags the order whose call clamped it.
//
// Two payments for the last unit at the same moment both pass the first check; the clamp then
// catches the one that took stock below 0. With three or more at once, two decrements can land
// before either clamp, and only one order is flagged although two oversold: accepted (the owner
// still sees stock at 0 and a flagged order), and written down in the plan.
//
// Neither may throw inside the settlement: `stockShortfalls` runs before the plugin claims the
// transaction (a throw there leaves the payment to be settled again), and `clampOversold` catches
// and logs everything.

type Line = { product?: unknown; quantity?: unknown }

/** Notes for the owner, in the site's default language (the admin's data, not the public site's). */
const notes = {
  fr: {
    shortfall: (title: string, quantity: number, left: number) =>
      `Stock insuffisant à la confirmation du paiement : ${quantity} × ${title} commandés, ${left} en stock.`,
    gone: (id: string) => `Le produit ${id} n’existe plus : vérifiez la commande avant de l’expédier.`,
    clamped: (title: string) => `Le stock de ${title} est passé sous 0 avec cette commande : il a été remis à 0.`,
  },
  en: {
    shortfall: (title: string, quantity: number, left: number) =>
      `Not enough stock when the payment was confirmed: ${quantity} × ${title} ordered, ${left} in stock.`,
    gone: (id: string) => `Product ${id} no longer exists: check the order before shipping it.`,
    clamped: (title: string) => `Stock of ${title} went below 0 with this order: it was set back to 0.`,
  },
}

/** The site's default language: product names and notes are read and written in it. */
function noteLanguage(req: PayloadRequest): keyof typeof notes {
  const localization = req.payload.config.localization
  return localization && localization.defaultLocale === 'en' ? 'en' : 'fr'
}

/** Each product's quantity across the lines. */
function quantities(lines: readonly Line[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const line of lines) {
    const id = productIdOf(line.product)
    if (id && typeof line.quantity === 'number') totals.set(id, (totals.get(id) ?? 0) + line.quantity)
  }
  return totals
}

async function titles(req: PayloadRequest, ids: string[]): Promise<Map<string, { title: string; inventory: number | null | undefined }>> {
  if (!ids.length) return new Map()
  const { docs } = await req.payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    trash: true,
    locale: noteLanguage(req),
    select: { title: true, inventory: true },
    req,
  })
  return new Map(docs.map((doc) => [String(doc.id), { title: doc.title || `#${doc.id}`, inventory: doc.inventory }]))
}

/**
 * What the stock left can't cover, as notes for the order (empty when all is fine). Stock that
 * isn't tracked (empty) covers anything. Reads only.
 */
export async function stockShortfalls(req: PayloadRequest, lines: readonly Line[]): Promise<string[]> {
  const wanted = quantities(lines)
  const products = await titles(req, [...wanted.keys()])
  const t = notes[noteLanguage(req)]
  const found: string[] = []
  for (const [id, quantity] of wanted) {
    const product = products.get(id)
    if (!product) found.push(t.gone(id))
    else if (product.inventory != null && product.inventory < quantity) found.push(t.shortfall(product.title, quantity, Math.max(0, product.inventory)))
  }
  return found
}

/**
 * Sets back to 0 the stock of every product of `lines` that is below 0, and flags `order` for each
 * one this call set back. Never throws: it runs after the order exists.
 */
export async function clampOversold(req: PayloadRequest, lines: readonly Line[], order: { id?: unknown; attentionNote?: unknown }): Promise<void> {
  try {
    const clampedIds: string[] = []
    for (const id of quantities(lines).keys()) {
      const clamped = await req.payload.db.updateOne({
        collection: 'products',
        where: { and: [{ id: { equals: id } }, { inventory: { less_than: 0 } }] },
        data: { inventory: 0 },
        options: { atomic: true },
        req,
      })
      if (clamped) clampedIds.push(id)
    }
    if (!clampedIds.length || (typeof order.id !== 'number' && typeof order.id !== 'string')) return
    const products = await titles(req, clampedIds)
    const t = notes[noteLanguage(req)]
    const added = clampedIds.map((id) => t.clamped(products.get(id)?.title ?? `#${id}`))
    const note = [typeof order.attentionNote === 'string' ? order.attentionNote : '', ...added].filter(Boolean).join('\n')
    // No hooks, no validation: this is cleanup after settlement.
    await req.payload.db.updateOne({ collection: 'orders', id: order.id, data: { needsAttention: true, attentionNote: note }, req })
    req.payload.logger.warn({ msg: `Shop: order ${String(order.id)} took stock below 0 (products ${clampedIds.join(', ')}): set back to 0 and flagged.` })
  } catch (error) {
    req.payload.logger.error({ err: error, msg: `Shop: could not set stock back to 0 after order ${String(order.id)}` })
  }
}
