import { ValidationError, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

import { shopConfig } from '../config'
import { type CartProduct, isQuantity, type LineProblem, lineProblem, MAX_CART_LINES, priceSelect, productIdOf } from './rules'

// The rules every cart write follows, whichever way it comes: the plugin's REST endpoints
// (`add-item`, `update-item`, `remove-item`, `clear`), a plain create or PATCH of the cart, the
// shop's own cart actions, the Local API, and the plugin's own write when an order is confirmed.
// The ecommerce plugin prices a cart's items with `overrideAccess` and checks neither publication
// nor stock (it checks stock only when a payment starts), so without this a guest could put a
// draft, a product in the trash or more than the stock in a cart.
//
// - The cart's currency is always the shop's (`shop.currency`). The plugin prices items with
//   `priceIn<currency>`: a guest who sent `currency: null` would get a NaN subtotal.
// - A line's quantity is a whole number of at least 1 (checked on the lines the write changes),
//   and a line has no `variant` (variants are off).
// - What the write grows is checked; what it leaves as it was, or shrinks, is not. Growing means:
//   a product it adds or asks more of, more lines than the cart had, or a second line for a
//   product. A product it grows must be one visitors can read (published, not in the trash), with
//   a price, in stock for the whole quantity of that product in the cart, and at most
//   `MAX_LINE_QUANTITY` of it. A write that grows the cart keeps it at `MAX_CART_LINES` lines, one
//   per product.
// - Why only growth: a line that sold out or was unpublished since it was added is flagged by the
//   cart and holds checkout back until the guest lowers or removes it. Refusing such writes would
//   stop the guest from fixing the cart, and would make the plugin's own write when an order is
//   confirmed (`purchasedAt`, with every line as it is) throw, which must never happen (plan,
//   "Orders").
// - A line whose product is gone (deleted, or in the trash) is dropped: it can never be bought,
//   and the plugin's pricing, which reads every product, would fail on it and lock the cart.
//
// Cost on every write that has items: one query for the cart's products (as visitors read them),
// and one more only when some of them aren't readable, to tell an unpublished product from a gone
// one. This is on top of the plugin's pricing, one query per line. Fine for carts of a few lines.

type Item = { product?: unknown; quantity?: unknown; variant?: unknown }

/** Why a cart write was refused: a line's problem, or what is wrong with the write itself. */
export type CartProblem =
  | LineProblem
  | { kind: 'badQuantity' }
  | { kind: 'tooManyLines'; max: number }
  | { kind: 'badItem' }

/** A cart write refused because of one of its lines. `problem` says why, for the shop's own messages. */
export class CartItemError extends ValidationError {
  readonly problem: CartProblem
  readonly productId: string | null

  constructor(problem: CartProblem, productId: string | null, path: string, req: PayloadRequest, message = problemMessage(problem)) {
    super({ collection: 'carts', errors: [{ message, path }], req }, req.t)
    this.problem = problem
    this.productId = productId
  }
}

/** Messages for API clients, in English: the public site shows its own, translated. */
function problemMessage(problem: CartProblem): string {
  switch (problem.kind) {
    case 'badQuantity':
      return 'Expected a whole number of at least 1.'
    case 'badItem':
      return 'This line is not valid.'
    case 'tooManyLines':
      return `A cart holds at most ${problem.max} different products.`
    case 'unavailable':
      return 'This product is not for sale.'
    case 'soldOut':
      return 'This product is sold out.'
    case 'notEnoughStock':
      return `Only ${problem.available} left in stock.`
    case 'tooMany':
      return `At most ${problem.max} of one product.`
  }
}

/** Per product id: how many of it, all lines added up, and on how many lines. */
function byProduct(items: Item[]): Map<string, { quantity: number; lines: number }> {
  const totals = new Map<string, { quantity: number; lines: number }>()
  for (const item of items) {
    const id = productIdOf(item.product)
    if (id === null || typeof item.quantity !== 'number') continue
    const total = totals.get(id) ?? { quantity: 0, lines: 0 }
    totals.set(id, { quantity: total.quantity + item.quantity, lines: total.lines + 1 })
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
  const { currency } = shopConfig()
  data.currency = currency
  if (!Array.isArray(data.items)) return data
  const items = (data.items as Item[]).filter((item) => productIdOf(item.product) !== null)
  const lineOf = (id: string) => items.findIndex((item) => productIdOf(item.product) === id)

  const previous = (Array.isArray(originalDoc?.items) ? (originalDoc.items as Item[]) : []).filter((item) => productIdOf(item.product) !== null)
  const wanted = byProduct(items)
  const before = byProduct(previous)
  /** Whether the write changes this product's lines (a new product, another quantity, another line count). */
  const changes = (id: string) => {
    const now = wanted.get(id)
    const then = before.get(id)
    return !then || !now || now.quantity !== then.quantity || now.lines !== then.lines
  }

  items.forEach((item, index) => {
    const productId = productIdOf(item.product)!
    if (item.variant != null) throw new CartItemError({ kind: 'badItem' }, productId, `items.${index}.variant`, req, 'This shop sells no variants.')
    if (typeof item.quantity !== 'number' || (!isQuantity(item.quantity) && changes(productId))) {
      throw new CartItemError({ kind: 'badQuantity' }, productId, `items.${index}.quantity`, req)
    }
  })

  if (items.length > MAX_CART_LINES && items.length > previous.length) {
    throw new CartItemError({ kind: 'tooManyLines', max: MAX_CART_LINES }, null, 'items', req)
  }

  for (const [id, { lines }] of wanted) {
    if (lines > 1 && lines > (before.get(id)?.lines ?? 0)) {
      throw new CartItemError({ kind: 'badItem' }, id, `items.${lineOf(id)}`, req, 'A product goes on one line: change its quantity instead.')
    }
  }

  const readable = await readableProducts(req, [...wanted.keys()])
  for (const [id, { quantity }] of wanted) {
    if (quantity <= (before.get(id)?.quantity ?? 0)) continue
    const problem = lineProblem(readable.get(id) ?? null, quantity, currency)
    if (problem) throw new CartItemError(problem, id, `items.${lineOf(id)}`, req)
  }

  const unreadable = [...wanted.keys()].filter((id) => !readable.has(id))
  const existing = await existingProducts(req, unreadable)
  const gone = new Set(unreadable.filter((id) => !existing.has(id)))
  data.items = items.filter((item) => !gone.has(productIdOf(item.product)!))
  return data
}
