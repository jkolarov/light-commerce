import type { FieldHook, PayloadRequest } from 'payload'

import { isStaffOrOwner } from '@/core/access'

// Stock is never read from, or written back from, a saved version of a product.
//
// Why: the ecommerce plugin takes stock on a sale with a raw `$inc` on the live document, which
// leaves the product's versions alone. With drafts on, Payload 4 reads the admin's edit view and
// list (`draft: true`), and the document every update starts from, out of the latest version. So
// the admin would show the stock as it was at the last save, and saving the product for any
// reason would write that old number back over every sale since.
//
// What it means for the owner: a stock number takes effect when the product is published. A
// draft does not keep a stock change; the next time the product opens it shows the live stock.
// Restoring an old version brings back its text and price, not its stock.

/** The stock on the live document, which is what sales change. */
async function liveInventory(req: PayloadRequest, id: number | string): Promise<number | null | undefined> {
  const doc = await req.payload.db.findOne<{ id: number | string; inventory?: number | null }>({
    collection: 'products',
    where: { id: { equals: id } },
    select: { inventory: true },
    req,
  })
  return doc ? doc.inventory : undefined
}

/**
 * `afterRead` on `inventory`: shows the live stock to the admin (staff and owners) and to server
 * code (`overrideAccess`, which is also how an update reads the document it starts from, so an
 * update that does not send the stock keeps the live one; a number it sends wins). Public reads
 * never get drafts, so they already read the live document and skip the extra query.
 *
 * It never throws: it also runs while the plugin settles a payment (the new order's products are
 * read back), where an error would leave the transaction stuck (plan, "Orders").
 */
export const showLiveStock: FieldHook = async ({ value, data, overrideAccess, req }) => {
  const id = (data as { id?: number | string } | undefined)?.id
  if (id === undefined || !(overrideAccess || isStaffOrOwner({ req }))) return value
  try {
    const live = await liveInventory(req, id)
    return live === undefined ? value : live
  } catch (error) {
    req.payload.logger.warn({ err: error, msg: `Could not read the live stock of product ${String(id)}` })
    return value
  }
}

/**
 * `beforeChange` on `inventory`: restoring an old version brings back its text and price, not its
 * stock. (A restore writes the version's own data, which never went through `showLiveStock`.)
 */
export const keepLiveStockOnRestore: FieldHook = async ({ value, data, originalDoc, req }) => {
  const id = (originalDoc as { id?: number | string } | undefined)?.id ?? (data as { id?: number | string } | undefined)?.id
  if (!req.context?.isRestoringVersion || id === undefined) return value
  const live = await liveInventory(req, id)
  return live === undefined ? value : live
}
