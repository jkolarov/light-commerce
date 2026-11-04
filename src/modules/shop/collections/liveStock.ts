import { ValidationError } from 'payload'
import type { CollectionAfterChangeHook, CollectionAfterReadHook, Field, FieldHook, PayloadRequest } from 'payload'

import { isStaffOrOwner } from '@/core/access'

// Stock is operational data, not editorial content: it lives on the live product only, and drafts
// and versions never hold it.
//
// - Reads: stock always comes from the live document. The ecommerce plugin takes stock on a sale
//   with a raw `$inc` on the live document only, while Payload 4 reads the admin's edit view and
//   list (`draft: true`), and the document every update starts from, out of the latest version.
// - Writes: Payload never writes the stock column when a product is updated. A save that changes
//   the stock writes that one field on the live document, at once, on any save (draft or publish),
//   after the save went through. A save that does not change it writes nothing, so sales made
//   meanwhile are never overwritten. Restoring an old version never touches stock.
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

const isStock = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0)

/**
 * `beforeChange` on `inventory`, for updates: takes the stock out of what Payload writes, and
 * keeps a change for `applyStockChange`. Creating a product writes its first stock as usual.
 */
export const takeStockChange: FieldHook = ({ value, previousValue, siblingData, originalDoc, operation, req }) => {
  if (operation !== 'update') return value
  const id = (originalDoc as { id?: number | string } | undefined)?.id
  // Drizzle skips undefined columns, so the update leaves the live stock alone.
  delete siblingData.inventory
  if (id === undefined) return undefined
  const changes = ((req.context[STOCK_CHANGES] as StockChanges | undefined) ??= {})
  delete changes[String(id)]
  const loaded = 'loadedInventory' in siblingData ? siblingData.loadedInventory : previousValue
  if (req.context.isRestoringVersion || value === undefined || value === loaded) return undefined
  // Checked here because draft saves skip validation, and the change applies to the live stock.
  if (!isStock(value)) {
    throw new ValidationError(
      { errors: [{ path: 'inventory', message: 'Expected a whole number of units, 0 or more.' }] },
      req.t,
    )
  }
  changes[String(id)] = value
  return undefined
}

/** `afterChange` on the collection: writes a stock change, and only the stock, once the save went through. */
export const applyStockChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  const changes = req.context[STOCK_CHANGES] as StockChanges | undefined
  const key = String(doc.id)
  if (!changes || !(key in changes)) return doc
  const inventory = changes[key]
  delete changes[key]
  await req.payload.db.updateOne({ collection: 'products', id: doc.id, data: { inventory }, req })
  return 'loadedInventory' in doc ? { ...doc, inventory, loadedInventory: inventory } : { ...doc, inventory }
}
