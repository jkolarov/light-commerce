import type { CollectionAfterChangeHook, CollectionAfterReadHook, Field, FieldHook, PayloadRequest } from 'payload'

import { isStaffOrOwner } from '@/core/access'

import { isWholeOrEmpty, refuse, UNITS_MESSAGE } from './fields'

// Stock is operational data, not editorial content: it lives on the live product only, and drafts
// and versions never hold it.
//
// - Reads: stock always comes from the live document. The ecommerce plugin takes stock on a sale
//   with a raw `$inc` on the live document only, while Payload 4 reads the admin's edit view and
//   list (`draft: true`), and the document every update starts from, out of the latest version.
// - Writes: an update hands Payload no stock to write (`takeStockChange` removes it). Payload's
//   one-language publish would copy the stock back from a read taken during the save, so every
//   publish goes through the all-languages path instead (`publishInEveryLocale`), which writes
//   only what it was given. A save that changes the stock writes that one field on the live
//   document, at once, on any save (draft or publish), after the save went through. A save that
//   does not change it writes nothing, so sales made meanwhile are never overwritten. Restoring an
//   old version never touches stock.
// - "Changes the stock" means: the number sent differs from the one the editor loaded. The admin
//   sends that back in the hidden `loadedInventory` field. Server code that does not send it is
//   compared with the stock at the start of the save, so not sending `inventory` changes nothing.
// - If a sale happens between opening the product and saving a new number, the editor's explicit
//   number wins: it is a stock count, so it replaces the live value (no transaction, no merge).

/** `req.context` key: product id → new stock, from `takeStockChange` to `applyStockChange`. */
const STOCK_CHANGES = 'shop:stockChanges'

type StockChanges = Record<string, number | null>

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
 * code (`overrideAccess`, which is also how an update reads the document it starts from). Public
 * reads never get drafts, so they already read the live document and skip the extra query.
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

/** The stock the editor loaded, sent back by the admin with the form. Never stored, staff only. */
export const loadedInventoryField: Field = {
  name: 'loadedInventory',
  type: 'number',
  virtual: true,
  admin: { hidden: true },
}

/** `afterRead` on the collection: what the admin loads includes the stock it showed. */
export const rememberLoadedStock: CollectionAfterReadHook = ({ doc, req }) =>
  isStaffOrOwner({ req }) ? { ...doc, loadedInventory: doc.inventory } : doc

/**
 * `beforeChange` on `inventory`: refuses a stock that isn't a whole number on every save (draft
 * saves skip validators, and a draft create still writes the live row). On an update it takes the
 * stock out of what Payload writes, and keeps a change for `applyStockChange`. Creating a product
 * writes its first stock as usual.
 */
export const takeStockChange: FieldHook = ({ value, path, previousValue, siblingData, originalDoc, operation, req }) => {
  if (value !== undefined && !isWholeOrEmpty(value)) refuse(UNITS_MESSAGE, path, req)
  if (operation !== 'update') return value
  const id = (originalDoc as { id?: number | string } | undefined)?.id
  // Drizzle skips undefined columns, so the update leaves the live stock alone.
  delete siblingData.inventory
  if (id === undefined) return undefined
  const changes = ((req.context[STOCK_CHANGES] as StockChanges | undefined) ??= {})
  delete changes[String(id)]
  // The admin sends the number it loaded. Without it (server code; the update's starting document
  // carries an empty `loadedInventory`), compare with the stock at the start of the save.
  const loaded = typeof siblingData.loadedInventory === 'number' ? siblingData.loadedInventory : previousValue
  if (req.context.isRestoringVersion || value === undefined || value === loaded) return undefined
  changes[String(id)] = value as number | null
  return undefined
}

/** `afterChange` on the collection: writes a stock change, and only the stock, once the save went through. */
export const applyStockChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  const changes = req.context[STOCK_CHANGES] as StockChanges | undefined
  const key = String(doc.id)
  if (!changes || !(key in changes)) return doc
  const inventory = changes[key]
  delete changes[key]
  // No database transactions: if this write fails, the content is saved and the stock is not.
  await req.payload.db.updateOne({ collection: 'products', id: doc.id, data: { inventory }, req })
  return 'loadedInventory' in doc ? { ...doc, inventory, loadedInventory: inventory } : { ...doc, inventory }
}
