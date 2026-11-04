import { ValidationError, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

import { shopConfig } from '../config'
import { type CartProduct, isQuantity, type LineProblem, lineProblem, priceSelect } from './rules'

// The rules every cart write follows, whichever way it comes: the plugin's REST endpoints
// (`add-item`, `update-item`, `remove-item`), a plain create or PATCH of the cart, the shop's own
// cart actions or the Local API. The ecommerce plugin prices a cart's items with `overrideAccess`
// and checks neither publication nor stock (it checks stock only when a payment starts), so
// without this a guest could put a draft, a product in the trash or more than the stock in a cart.
//
// - Each line's quantity is a whole number of at least 1.
// - A product the write adds, or asks more of, must be one visitors can read (published, not in
//   the trash), with a price, and in stock for the whole quantity of that product in the cart.
// - A product the write leaves as it was, or asks less of, is kept even if it sold out or was
//   unpublished since it was added: the cart flags that line and checkout waits until the guest
//   lowers or removes it. Refusing such writes would stop the guest from fixing the cart.
// - A line whose product is gone (deleted, or in the trash) is dropped: it can never be bought,
//   and the plugin's pricing, which reads every product, would fail on it and lock the cart.
//
// Cost: one query for the products the write adds or grows, one more only when a line's product
// went away, on top of the plugin's one query per line. Fine for carts of a few lines.

type Item = { product?: unknown; quantity?: unknown }

/** A cart write refused because of one of its products. `problem` says why, for the shop's own messages. */
export class CartItemError extends ValidationError {
  readonly problem: LineProblem | { kind: 'badQuantity' }
  readonly productId: string | null

  constructor(problem: CartItemError['problem'], productId: string | null, path: string, req: PayloadRequest) {
    super({ collection: 'carts', errors: [{ message: problemMessage(problem), path }], req }, req.t)
    this.problem = problem
    this.productId = productId
  }
}

/** Messages for API clients, in English: the public site shows its own, translated. */
function problemMessage(problem: CartItemError['problem']): string {
  switch (problem.kind) {
    case 'badQuantity':
      return 'Expected a whole number of at least 1.'
    case 'unavailable':
      return 'This product is not for sale.'
    case 'soldOut':
      return 'This product is sold out.'
    case 'notEnoughStock':
      return `Only ${problem.available} left in stock.`
  }
}

/** A relationship's id as a string ("12"), whether it came as an id or a loaded document. */
export function productIdOf(value: unknown): string | null {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' || (typeof id === 'string' && id !== '') ? String(id) : null
}

/** Quantities per product id, all lines of a product added up. */
function quantitiesByProduct(items: Item[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const item of items) {
    const id = productIdOf(item.product)
    if (id !== null && typeof item.quantity === 'number') totals.set(id, (totals.get(id) ?? 0) + item.quantity)
  }
  return totals
}

/** The products visitors can read (published, not in the trash), with their price and live stock. */
async function readableProducts(req: PayloadRequest, ids: string[]): Promise<Map<string, CartProduct>> {
  if (!ids.length) return new Map()
  const { currency } = shopConfig()
  // No `req` and no user: read as an anonymous visitor, whoever writes the cart.
  const { docs } = await req.payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    draft: false,
    overrideAccess: false,
    select: { inventory: true, ...priceSelect(currency) },
  })
  return new Map(docs.map((doc) => [String(doc.id), doc as CartProduct]))
}

/** Of `ids`, those still in the database outside the trash (what the plugin's pricing can read). */
async function existingProducts(req: PayloadRequest, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const { docs } = await req.payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { inventory: true },
  })
  return new Set(docs.map((doc) => String(doc.id)))
}

/** `beforeChange` on carts, before the plugin's pricing: see the rules at the top of this file. */
export const checkCartItems: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (!Array.isArray(data.items)) return data
  const items = (data.items as Item[]).filter((item) => productIdOf(item.product) !== null)

  items.forEach((item, index) => {
    if (!isQuantity(item.quantity)) throw new CartItemError({ kind: 'badQuantity' }, productIdOf(item.product), `items.${index}.quantity`, req)
  })

  const wanted = quantitiesByProduct(items)
  const before = quantitiesByProduct(Array.isArray(originalDoc?.items) ? (originalDoc.items as Item[]) : [])
  const grown = [...wanted].filter(([id, quantity]) => quantity > (before.get(id) ?? 0)).map(([id]) => id)
  const readable = await readableProducts(req, [...wanted.keys()])

  for (const id of grown) {
    const problem = lineProblem(readable.get(id) ?? null, wanted.get(id)!, shopConfig().currency)
    if (problem) {
      const index = items.findIndex((item) => productIdOf(item.product) === id)
      throw new CartItemError(problem, id, `items.${index}`, req)
    }
  }

  const unreadable = [...wanted.keys()].filter((id) => !readable.has(id))
  const existing = await existingProducts(req, unreadable)
  const gone = new Set(unreadable.filter((id) => !existing.has(id)))
  data.items = items.filter((item) => !gone.has(productIdOf(item.product)!))
  return data
}
