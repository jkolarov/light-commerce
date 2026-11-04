import { cookies } from 'next/headers'

import { getLightConfig } from '@/config'

import type { CartRef } from './load'

// Which cart is the guest's lives in one cookie: the cart's id and its secret (`<id>.<secret>`).
//
// - httpOnly: page scripts can't read it, so a script injected into the page (XSS) can't copy the
//   secret and reach the cart from elsewhere. The browser never needs it: the server reads the
//   cart for the pages, and the cart actions (Server Actions) change it.
// - SameSite=Lax: other sites can't make the browser send it with their requests (form posts,
//   fetches), only with plain links to this site. Server Actions also check the request's Origin.
// - Path `/`: the same cart in every language (`/fr/...` and `/en/...`).
// - Secure whenever the site is served over HTTPS in production.
// - 30 days, renewed on every change to the cart.
//
// The secret is the ecommerce plugin's: 20 random bytes (160 bits) made when the cart is created.
// The cookie is a bearer token: anyone holding it holds the cart, nothing more (no account, no
// order, no address). httpOnly hides it from page scripts, not from the visitor: they can copy it
// and change their own cart over the plugin's REST endpoints. That is why every write goes
// through `checkCartItems`, and the checkout prices the cart again (`priceGuestCart`). Cookies can be set only by Server Actions and Route Handlers, so a cart is
// created on the first "add to cart", never by viewing a page.

export const CART_COOKIE = 'lc_cart'
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

/** The cart's id (`12`), a dot, then the 40 hex characters of its secret. Anything else is no cart. */
const REF = /^([1-9][0-9]{0,14})\.([0-9a-f]{40})$/

export function parseCartRef(value: string | undefined | null): CartRef | null {
  const match = value ? REF.exec(value) : null
  return match ? { id: Number(match[1]), secret: match[2]! } : null
}

export function formatCartRef(ref: CartRef): string {
  return `${ref.id}.${ref.secret}`
}

export function cartCookieOptions() {
  const https = new URL(getLightConfig().site.url).protocol === 'https:'
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE,
    secure: https && process.env.NODE_ENV === 'production',
  }
}

/** The guest's cart reference from the request's cookie, or `null`. */
export async function readCartRef(): Promise<CartRef | null> {
  return parseCartRef((await cookies()).get(CART_COOKIE)?.value)
}

/** Remembers the guest's cart. Server Actions and Route Handlers only. */
export async function saveCartRef(ref: CartRef): Promise<void> {
  ;(await cookies()).set(CART_COOKIE, formatCartRef(ref), cartCookieOptions())
}

/** Forgets the guest's cart (it is gone, or was bought). Server Actions and Route Handlers only. */
export async function forgetCartRef(): Promise<void> {
  ;(await cookies()).delete({ name: CART_COOKIE, path: '/' })
}
