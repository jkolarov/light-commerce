import config from '@payload-config'
import { unstable_rethrow } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/core/i18n/locales'

import { readCartRef } from './cookie'
import { type CartView, loadCart } from './load'

/**
 * The visitor's cart for this request, or `null` without one. Read once per request (the header's
 * cart button, the product page and the cart page share it). It never throws: the header is drawn
 * outside the page's error boundary, so a cart that can't be read shows as an empty one, and the
 * error is logged.
 */
export const currentCart = cache(async (locale: Locale): Promise<CartView | null> => {
  try {
    const ref = await readCartRef()
    return ref ? await loadCart(await getPayload({ config }), ref, locale) : null
  } catch (error) {
    unstable_rethrow(error)
    console.error('Shop: could not read the cart; it is shown as empty.', error)
    return null
  }
})

/** How many of a product the visitor's cart holds. */
export function quantityInCart(cart: CartView | null, productId: number | string): number {
  return (cart?.lines ?? []).filter((line) => line.productId === String(productId)).reduce((sum, line) => sum + line.quantity, 0)
}
