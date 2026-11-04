import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Product } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

// The cart as the public site uses it: the Server Actions (add, change, remove) on the cart in
// the visitor's cookie, and the view the pages draw (lines, flags, totals). Next's cookie store
// and `refresh` are stood in for; everything else is the real thing.

type Cookie = { value: string; options: Record<string, unknown> }
const jar = new Map<string, Cookie>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => void jar.set(name, { value, options }),
    delete: (arg: string | { name: string }) => void jar.delete(typeof arg === 'string' ? arg : arg.name),
  }),
}))
const refresh = vi.fn()
vi.mock('next/cache', () => ({ refresh: () => refresh() }))

describeWithShop('cart actions and view', () => {
  let test: TestPayload
  let payload: Payload
  let actions: typeof import('@/modules/shop/cart/actions')
  let cart: typeof import('@/modules/shop/cart/load')
  let cookie: typeof import('@/modules/shop/cart/cookie')

  const publish = (data: Partial<Product>) =>
    payload.create({ collection: 'products', data: { priceInEUR: 790, _status: 'published', ...data } as Product, overrideAccess: true })

  let verveine: Product // 7.90 €, 5 in stock
  let tilleul: Product // 8.50 €, stock not tracked

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    actions = await import('@/modules/shop/cart/actions')
    cart = await import('@/modules/shop/cart/load')
    cookie = await import('@/modules/shop/cart/cookie')
    verveine = await publish({ title: 'Verveine', slug: 'verveine', inventory: 5 })
    await payload.update({ collection: 'products', id: verveine.id, data: { title: 'Lemon verbena' }, locale: 'en', overrideAccess: true })
    tilleul = await publish({ title: 'Tilleul', slug: 'tilleul', priceInEUR: 850, inventory: null })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  beforeEach(() => {
    jar.clear()
    refresh.mockClear()
  })

  const ref = () => cookie.parseCartRef(jar.get(cookie.CART_COOKIE)?.value)
  const view = async (locale: 'fr' | 'en' = 'fr') => {
    const current = ref()
    return current ? cart.loadCart(payload, current, locale) : null
  }

  it('starts a cart on the first add, and keeps it in an httpOnly, SameSite=Lax cookie for the whole site', async () => {
    expect(await actions.addToCart({ productId: verveine.id, quantity: 2 })).toEqual({ ok: true })
    const saved = jar.get(cookie.CART_COOKIE)!
    expect(saved.value).toMatch(/^\d+\.[0-9a-f]{40}$/)
    expect(saved.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
    expect(refresh).toHaveBeenCalled()

    // The same cart from then on.
    const first = ref()!
    expect(await actions.addToCart({ productId: tilleul.id, quantity: 1 })).toEqual({ ok: true })
    expect(ref()).toEqual(first)
    const shown = (await view())!
    expect(shown.lines.map((line) => [line.title, line.quantity])).toEqual([
      ['Verveine', 2],
      ['Tilleul', 1],
    ])
  })

  it('changes and removes lines', async () => {
    await actions.addToCart({ productId: verveine.id, quantity: 1 })
    await actions.addToCart({ productId: tilleul.id, quantity: 1 })
    const [first, second] = (await view())!.lines
    expect(await actions.setLineQuantity({ lineId: first!.id, quantity: 4 })).toEqual({ ok: true })
    expect(await actions.removeLine({ lineId: second!.id })).toEqual({ ok: true })
    expect((await view())!.lines.map((line) => line.quantity)).toEqual([4])
  })

  it('says why an add is refused: not enough stock, counting the cart', async () => {
    await actions.addToCart({ productId: verveine.id, quantity: 4 })
    expect(await actions.addToCart({ productId: verveine.id, quantity: 2 })).toEqual({
      ok: false,
      problem: { kind: 'notEnoughStock', available: 5 },
    })
    const [line] = (await view())!.lines
    expect(await actions.setLineQuantity({ lineId: line!.id, quantity: 6 })).toMatchObject({ ok: false, problem: { kind: 'notEnoughStock' } })
    expect((await view())!.lines.map((l) => l.quantity)).toEqual([4])
  })

  it('refuses bad input before touching the cart', async () => {
    for (const quantity of [0, 1.5, 100, Number.NaN]) {
      expect(await actions.addToCart({ productId: verveine.id, quantity }), String(quantity)).toEqual({ ok: false, problem: { kind: 'badQuantity' } })
    }
    expect(await actions.addToCart({ productId: -1, quantity: 1 })).toMatchObject({ ok: false })
    expect(await actions.setLineQuantity({ lineId: "x' OR 1=1", quantity: 1 })).toMatchObject({ ok: false })
    expect(jar.size).toBe(0)
  })

  it('starts a new cart when the cookie holds a wrong secret, and never touches the other cart', async () => {
    await actions.addToCart({ productId: tilleul.id, quantity: 1 })
    const original = ref()!
    jar.set(cookie.CART_COOKIE, { value: `${original.id}.${'a'.repeat(40)}`, options: {} })
    expect(await cart.loadCart(payload, ref()!, 'fr')).toBeNull()
    expect(await actions.setLineQuantity({ lineId: 'anything', quantity: 2 })).toMatchObject({ ok: false })

    expect(await actions.addToCart({ productId: tilleul.id, quantity: 3 })).toEqual({ ok: true })
    expect(ref()!.id).not.toBe(original.id)
    const untouched = await payload.findByID({ collection: 'carts', id: original.id, overrideAccess: true })
    expect(untouched.items?.map((item) => item.quantity)).toEqual([1])
  })

  it('starts a new cart once the last one was bought', async () => {
    await actions.addToCart({ productId: tilleul.id, quantity: 1 })
    const bought = ref()!
    await payload.update({ collection: 'carts', id: bought.id, data: { purchasedAt: new Date().toISOString() }, overrideAccess: true })
    expect(await view()).toBeNull()
    await actions.addToCart({ productId: tilleul.id, quantity: 1 })
    expect(ref()!.id).not.toBe(bought.id)
  })

  describe('the view', () => {
    it('shows each line in the page language with its photo, prices from the stored prices, shipping and total', async () => {
      await actions.addToCart({ productId: verveine.id, quantity: 2 })
      await actions.addToCart({ productId: tilleul.id, quantity: 1 })
      // The client never sends prices; a price change shows at once.
      await payload.update({ collection: 'products', id: tilleul.id, data: { priceInEUR: 900 }, overrideAccess: true })
      const shown = (await view('en'))!
      expect(shown.lines.map((line) => [line.title, line.href, line.unitPrice, line.lineTotal])).toEqual([
        ['Lemon verbena', '/en/shop/verveine', 790, 1580],
        ['Tilleul', '/en/shop/tilleul', 900, 900],
      ])
      expect([shown.count, shown.subtotal, shown.shipping, shown.total]).toEqual([3, 2480, 490, 2970])
      expect(shown.lines.map((line) => line.maxQuantity)).toEqual([5, 99])
      expect(shown.canCheckout).toBe(true)
      expect(shown.shipsTo).toEqual(['FR'])
      await payload.update({ collection: 'products', id: tilleul.id, data: { priceInEUR: 850 }, overrideAccess: true })
    })

    it('flags a line that sold out or ran short since it was added, and holds checkout back', async () => {
      const mauve = await publish({ title: 'Mauve', inventory: 6 })
      await actions.addToCart({ productId: mauve.id, quantity: 4 })
      await actions.addToCart({ productId: tilleul.id, quantity: 1 })

      await payload.update({ collection: 'products', id: mauve.id, data: { inventory: 3 }, overrideAccess: true })
      let shown = (await view())!
      expect(shown.lines[0]!.problem).toEqual({ kind: 'notEnoughStock', available: 3 })
      expect(shown.lines[1]!.problem).toBeNull()
      expect(shown.canCheckout).toBe(false)

      await payload.update({ collection: 'products', id: mauve.id, data: { inventory: 0 }, overrideAccess: true })
      shown = (await view())!
      expect(shown.lines[0]!.problem).toEqual({ kind: 'soldOut' })
      expect(shown.canCheckout).toBe(false)

      // Fixed: the line is removed, checkout may go on.
      expect(await actions.removeLine({ lineId: shown.lines[0]!.id })).toEqual({ ok: true })
      expect((await view())!.canCheckout).toBe(true)
    })

    it('flags a line whose product is no longer for sale, without its name or price', async () => {
      const sauge = await publish({ title: 'Sauge', inventory: 6 })
      await actions.addToCart({ productId: sauge.id, quantity: 1 })
      await payload.update({ collection: 'products', id: sauge.id, data: { priceInEUREnabled: false }, overrideAccess: true })
      let [line] = (await view())!.lines
      expect(line!.problem).toEqual({ kind: 'unavailable' })
      expect(line!.lineTotal).toBeNull()

      await payload.update({ collection: 'products', id: sauge.id, data: { priceInEUREnabled: true, _status: 'draft' }, overrideAccess: true })
      ;[line] = (await view())!.lines
      expect(line).toMatchObject({ title: null, href: null, unitPrice: null, image: null, problem: { kind: 'unavailable' } })
      const shown = (await view())!
      expect([shown.subtotal, shown.shipping, shown.canCheckout]).toEqual([0, 0, false])
    })

    it('counts an empty cart as nothing to check out', async () => {
      await actions.addToCart({ productId: tilleul.id, quantity: 1 })
      await actions.removeLine({ lineId: (await view())!.lines[0]!.id })
      const shown = (await view())!
      expect([shown.lines, shown.count, shown.subtotal, shown.shipping, shown.canCheckout]).toEqual([[], 0, 0, 0, false])
    })
  })
})

describeWithShop('cart cookie', () => {
  it('reads only a well-formed cart reference', async () => {
    const { parseCartRef, formatCartRef } = await import('@/modules/shop/cart/cookie')
    const secret = 'ab12'.repeat(10)
    expect(parseCartRef(`12.${secret}`)).toEqual({ id: 12, secret })
    expect(formatCartRef({ id: 12, secret })).toBe(`12.${secret}`)
    for (const value of [undefined, '', '12', `12:${secret}`, `12.${secret}x`, `0.${secret}`, `-1.${secret}`, `12.${secret.toUpperCase()}`, `1 2.${secret}`, `12.${secret};x=1`]) {
      expect(parseCartRef(value), String(value)).toBeNull()
    }
  })
})
