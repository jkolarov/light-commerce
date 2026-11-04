'use server'

import config from '@payload-config'
import { addItem, removeItem, updateItem } from '@payloadcms/plugin-ecommerce'
import { refresh } from 'next/cache'
import { createPayloadRequest, getPayload, type Payload } from 'payload'
import { z } from 'zod'

import { shopConfig } from '../config'
import { CartItemError } from './checkItems'
import { readCartRef, saveCartRef } from './cookie'
import { type CartRef, findGuestCart } from './load'
import type { LineProblem } from './rules'
import { MAX_LINE_QUANTITY } from './rules'

// The cart's Server Actions: what the add-to-cart control, the drawer and the cart page call.
// They work on the cart in the visitor's cookie only, through the ecommerce plugin's own cart
// operations (the same ones its REST endpoints run), so every rule of `checkCartItems` applies.
// Anyone can call a Server Action with any arguments: each input is checked here first.
// After a change the page is drawn again on the server (`refresh`), so the header's count, the
// drawer and the cart page all show the stored cart.

export type CartActionProblem = LineProblem | { kind: 'badQuantity' } | { kind: 'failed' }
export type CartActionResult = { ok: true } | { ok: false; problem: CartActionProblem }

const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY)
const lineId = z.string().regex(/^[A-Za-z0-9-]{1,64}$/)
const addInput = z.object({ productId: z.number().int().positive(), quantity })
const changeInput = z.object({ lineId, quantity })
const removeInput = z.object({ lineId })

const failed: CartActionResult = { ok: false, problem: { kind: 'failed' } }

/** Runs a cart change; a refused one says why, anything else is logged and reported as failed. */
async function change(payload: Payload, run: () => Promise<boolean>): Promise<CartActionResult> {
  try {
    const done = await run()
    return done ? { ok: true } : failed
  } catch (error) {
    if (error instanceof CartItemError) return { ok: false, problem: error.problem }
    payload.logger.error({ err: error, msg: 'Shop: a cart change failed' })
    return failed
  } finally {
    refresh()
  }
}

/** The visitor's cart, if it still exists and was not bought. */
async function guestCart(payload: Payload): Promise<CartRef | null> {
  const ref = await readCartRef()
  return ref && (await findGuestCart(payload, ref)) ? ref : null
}

/** Adds `quantity` of a product, starting a cart on the first add. */
export async function addToCart(input: { productId: number; quantity: number }): Promise<CartActionResult> {
  const parsed = addInput.safeParse(input)
  if (!parsed.success) return { ok: false, problem: { kind: 'badQuantity' } }
  const { productId, quantity } = parsed.data
  const payload = await getPayload({ config })
  const ref = await guestCart(payload)
  return change(payload, async () => {
    if (ref) {
      const req = await createPayloadRequest({ payload })
      const result = await addItem({ payload, cartsSlug: 'carts', cartID: ref.id, item: { product: productId }, quantity, req, secret: ref.secret })
      if (result.success) await saveCartRef(ref)
      return result.success
    }
    // A new guest cart (or the last one was bought): the plugin makes its secret.
    const cart = await payload.create({
      collection: 'carts',
      data: { items: [{ product: productId, quantity }], currency: shopConfig().currency },
      depth: 0,
      overrideAccess: false,
    })
    if (!cart.secret) throw new Error('The new cart came back without its secret.')
    await saveCartRef({ id: cart.id, secret: cart.secret })
    return true
  })
}

/** Sets the quantity of one line of the visitor's cart. */
export async function setLineQuantity(input: { lineId: string; quantity: number }): Promise<CartActionResult> {
  const parsed = changeInput.safeParse(input)
  if (!parsed.success) return { ok: false, problem: { kind: 'badQuantity' } }
  const payload = await getPayload({ config })
  const ref = await guestCart(payload)
  if (!ref) return change(payload, async () => false)
  return change(payload, async () => {
    const req = await createPayloadRequest({ payload })
    const result = await updateItem({
      payload,
      cartsSlug: 'carts',
      cartID: ref.id,
      itemID: parsed.data.lineId,
      quantity: parsed.data.quantity,
      req,
      secret: ref.secret,
    })
    if (result.success) await saveCartRef(ref)
    return result.success
  })
}

/** Removes one line from the visitor's cart. */
export async function removeLine(input: { lineId: string }): Promise<CartActionResult> {
  const parsed = removeInput.safeParse(input)
  if (!parsed.success) return failed
  const payload = await getPayload({ config })
  const ref = await guestCart(payload)
  if (!ref) return change(payload, async () => false)
  return change(payload, async () => {
    const req = await createPayloadRequest({ payload })
    const result = await removeItem({ payload, cartsSlug: 'carts', cartID: ref.id, itemID: parsed.data.lineId, req, secret: ref.secret })
    if (result.success) await saveCartRef(ref)
    return result.success
  })
}
