import { handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Cart, Product } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

// The guest cart through the real REST handler: the ecommerce plugin's endpoints
// (`/api/carts`, `/api/carts/:id/add-item`, `/update-item`, `/remove-item`), with the rules the
// shop adds on every cart write (published products with a price, never more than the stock).
describeWithShop('guest cart over REST', () => {
  let test: TestPayload
  let payload: Payload

  type Guest = { id: number; secret: string }
  type Result = {
    status: number
    body: { doc?: Cart; docs?: Cart[]; secret?: string; errors?: { message: string }[]; message?: string }
  }

  const rest = async (url: string, method = 'GET', body?: unknown): Promise<Result> => {
    const address = new URL(url, 'http://localhost')
    const res = await handleEndpoints({
      config: payload.config,
      path: address.pathname,
      request: new Request(address, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      }),
    })
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Result['body'] }
  }

  const publish = (data: Partial<Product>) =>
    payload.create({
      collection: 'products',
      data: { priceInEUR: 790, _status: 'published', ...data } as Product,
      overrideAccess: true,
    })

  const newGuest = async (items: { product: number; quantity: number }[] = []): Promise<Guest> => {
    const { status, body } = await rest('/api/carts', 'POST', { items, currency: 'EUR' })
    expect(status, JSON.stringify(body)).toBe(201)
    return { id: body.doc!.id, secret: body.doc!.secret! }
  }

  const add = (guest: Guest, product: number, quantity = 1) =>
    rest(`/api/carts/${guest.id}/add-item`, 'POST', { item: { product }, quantity, secret: guest.secret })
  const update = (guest: Guest, itemID: string, quantity: number) =>
    rest(`/api/carts/${guest.id}/update-item`, 'POST', { itemID, quantity, secret: guest.secret })
  const remove = (guest: Guest, itemID: string) =>
    rest(`/api/carts/${guest.id}/remove-item`, 'POST', { itemID, secret: guest.secret })
  const stored = (guest: Guest) => payload.findByID({ collection: 'carts', id: guest.id, depth: 0, overrideAccess: true })
  const quantities = async (guest: Guest) => (await stored(guest)).items?.map((item) => item.quantity) ?? []
  const lineID = async (guest: Guest, product: number) =>
    (await stored(guest)).items!.find((item) => item.product === product)!.id!
  const setStock = (id: number, inventory: number | null) =>
    payload.update({ collection: 'products', id, data: { inventory }, overrideAccess: true })

  let verveine: Product // 7.90 €, 5 in stock
  let tilleul: Product // 8.50 €, stock not tracked
  let soldOut: Product
  let draft: Product
  let noPrice: Product
  let trashed: Product

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    verveine = await publish({ title: 'Verveine', inventory: 5 })
    tilleul = await publish({ title: 'Tilleul', priceInEUR: 850, inventory: null })
    soldOut = await publish({ title: 'Mauve', inventory: 0 })
    noPrice = await publish({ title: 'Sans prix', priceInEUR: null, inventory: 10 })
    draft = await payload.create({
      collection: 'products',
      data: { title: 'Brouillon', priceInEUR: 500, inventory: 10, _status: 'draft' } as Product,
      draft: true,
      overrideAccess: true,
    })
    trashed = await publish({ title: 'Ancienne', inventory: 10 })
    await payload.update({ collection: 'products', id: trashed.id, data: { deletedAt: new Date().toISOString() }, overrideAccess: true })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  describe('a guest', () => {
    it('starts a cart and gets an unguessable secret (160 random bits), shown only once', async () => {
      const guest = await newGuest()
      expect(guest.secret).toMatch(/^[0-9a-f]{40}$/)
      const read = await rest(`/api/carts/${guest.id}?secret=${guest.secret}`)
      expect(read.status).toBe(200)
      expect(read.body.secret).toBeUndefined()
      expect(JSON.stringify(read.body)).not.toContain(guest.secret)
    })

    it('adds, changes and removes items; the subtotal comes from the stored prices', async () => {
      const guest = await newGuest()
      expect((await add(guest, verveine.id, 2)).status).toBe(200)
      expect((await stored(guest)).subtotal).toBe(1580)

      // The same product again: one line, more of it.
      expect((await add(guest, verveine.id, 1)).status).toBe(200)
      expect((await add(guest, tilleul.id, 1)).status).toBe(200)
      expect(await quantities(guest)).toEqual([3, 1])
      expect((await stored(guest)).subtotal).toBe(3 * 790 + 850)

      expect((await update(guest, await lineID(guest, verveine.id), 1)).status).toBe(200)
      expect((await stored(guest)).subtotal).toBe(790 + 850)

      expect((await remove(guest, await lineID(guest, tilleul.id))).status).toBe(200)
      expect(await quantities(guest)).toEqual([1])
      expect((await stored(guest)).subtotal).toBe(790)

      expect((await rest(`/api/carts/${guest.id}/clear`, 'POST', { secret: guest.secret })).status).toBe(200)
      expect(await quantities(guest)).toEqual([])
      expect((await stored(guest)).subtotal).toBe(0)
    })

    it('cannot set its own subtotal or prices', async () => {
      const created = await rest('/api/carts', 'POST', { items: [{ product: verveine.id, quantity: 2 }], currency: 'EUR', subtotal: 1 })
      expect(created.status).toBe(201)
      const guest = { id: created.body.doc!.id, secret: created.body.doc!.secret! }
      expect((await stored(guest)).subtotal).toBe(1580)
      const patched = await rest(`/api/carts/${guest.id}?secret=${guest.secret}`, 'PATCH', { subtotal: 5 })
      expect(patched.status).toBe(200)
      expect((await stored(guest)).subtotal).toBe(1580)
    })

    it("prices a cart created without a currency in the shop's currency", async () => {
      const created = await rest('/api/carts', 'POST', { items: [{ product: tilleul.id, quantity: 2 }] })
      expect(created.status).toBe(201)
      expect(created.body.doc).toMatchObject({ currency: 'EUR', subtotal: 1700 })
    })

    it('cannot change the secret of its cart', async () => {
      const guest = await newGuest()
      await rest(`/api/carts/${guest.id}?secret=${guest.secret}`, 'PATCH', { secret: 'chosen-by-the-guest' })
      expect((await add(guest, tilleul.id)).status).toBe(200)
      expect((await rest(`/api/carts/${guest.id}?secret=chosen-by-the-guest`)).status).toBe(404)
    })
  })

  describe('secrets', () => {
    it('refuses a cart change with a wrong secret, or none', async () => {
      const guest = await newGuest([{ product: tilleul.id, quantity: 1 }])
      const wrong = { ...guest, secret: '0'.repeat(40) }
      expect((await add(wrong, tilleul.id, 1)).status).toBe(404)
      expect((await update(wrong, await lineID(guest, tilleul.id), 9)).status).toBe(404)
      expect((await remove(wrong, await lineID(guest, tilleul.id))).status).toBe(404)
      expect([403, 404]).toContain((await rest(`/api/carts/${guest.id}/add-item`, 'POST', { item: { product: tilleul.id } })).status)
      expect((await rest(`/api/carts/${guest.id}/clear`, 'POST', { secret: wrong.secret })).status).toBe(404)
      // Payload answers a refused PATCH or DELETE with 403 rather than 404.
      expect([403, 404]).toContain((await rest(`/api/carts/${guest.id}?secret=${wrong.secret}`, 'PATCH', { items: [] })).status)
      expect([403, 404]).toContain((await rest(`/api/carts/${guest.id}?secret=${wrong.secret}`, 'DELETE')).status)
      expect(await quantities(guest)).toEqual([1])
    })

    it("never shows a guest another guest's cart", async () => {
      const alice = await newGuest([{ product: tilleul.id, quantity: 2 }])
      const bob = await newGuest()
      expect((await rest(`/api/carts/${alice.id}?secret=${bob.secret}`)).status).toBe(404)
      expect([403, 404]).toContain((await rest(`/api/carts/${alice.id}`)).status)

      const bobsList = await rest(`/api/carts?secret=${bob.secret}`)
      expect(bobsList.status).toBe(200)
      expect(bobsList.body.docs?.map((cart) => cart.id)).toEqual([bob.id])

      // No list without a secret, and the secret can't be searched for, even with one's own.
      expect((await rest('/api/carts')).status).toBe(403)
      for (const query of ['where[secret][like]=a', 'where[secret][exists]=true', 'sort=secret']) {
        const res = await rest(`/api/carts?secret=${bob.secret}&${query}`)
        expect(JSON.stringify(res.body), query).not.toContain(String(alice.secret))
        expect(res.body.docs?.map((cart) => cart.id) ?? [], query).not.toContain(alice.id)
      }
      expect(JSON.stringify((await rest(`/api/carts?where[secret][like]=${alice.secret.slice(0, 4)}`)).body)).not.toContain(`"id":${alice.id}`)
    })
  })

  describe('what can go in a cart', () => {
    it('refuses a draft, a product in the trash and one without a price, on add', async () => {
      const guest = await newGuest()
      for (const product of [draft, trashed, noPrice]) {
        const res = await add(guest, product.id, 1)
        expect(res.status, product.title ?? '').toBe(400)
      }
      expect(await quantities(guest)).toEqual([])
    })

    it('refuses them when the cart is created or replaced with them, too', async () => {
      for (const product of [draft, trashed, noPrice, soldOut]) {
        const res = await rest('/api/carts', 'POST', { items: [{ product: product.id, quantity: 1 }], currency: 'EUR' })
        expect(res.status, product.title ?? '').toBe(400)
      }
      const guest = await newGuest()
      const patched = await rest(`/api/carts/${guest.id}?secret=${guest.secret}`, 'PATCH', { items: [{ product: draft.id, quantity: 1 }] })
      expect(patched.status).toBe(400)
      expect(await quantities(guest)).toEqual([])
    })

    it('refuses an unknown product', async () => {
      const guest = await newGuest()
      expect((await add(guest, 999_999, 1)).status).toBe(400)
    })

    it('refuses a quantity that is not a whole number of at least 1', async () => {
      const guest = await newGuest()
      for (const quantity of [1.5, 0, -2]) {
        const res = await rest('/api/carts', 'POST', { items: [{ product: tilleul.id, quantity }], currency: 'EUR' })
        expect(res.status, String(quantity)).toBe(400)
      }
      expect((await add(guest, tilleul.id, 1.5)).status).toBe(400)
      expect(await quantities(guest)).toEqual([])
    })
  })

  describe('stock', () => {
    it('takes up to the stock, never more, counting what is already in the cart', async () => {
      const guest = await newGuest()
      expect((await add(guest, verveine.id, 6)).status).toBe(400)
      expect((await add(guest, verveine.id, 4)).status).toBe(200)
      expect((await add(guest, verveine.id, 2)).status).toBe(400)
      expect((await add(guest, verveine.id, 1)).status).toBe(200)
      expect(await quantities(guest)).toEqual([5])
      expect((await update(guest, await lineID(guest, verveine.id), 6)).status).toBe(400)
      expect(await quantities(guest)).toEqual([5])
    })

    it('refuses a sold-out product', async () => {
      const guest = await newGuest()
      const res = await add(guest, soldOut.id, 1)
      expect(res.status).toBe(400)
      expect(JSON.stringify(res.body)).toMatch(/sold out/i)
    })

    it('counts two lines of one product together', async () => {
      const guest = await newGuest()
      const res = await rest(`/api/carts/${guest.id}?secret=${guest.secret}`, 'PATCH', {
        items: [{ product: verveine.id, quantity: 3 }, { product: verveine.id, quantity: 3 }],
      })
      expect(res.status).toBe(400)
    })

    it('sells a product whose stock is not tracked without a limit', async () => {
      const guest = await newGuest()
      expect((await add(guest, tilleul.id, 40)).status).toBe(200)
    })

    it('lets a guest lower or remove a line whose product sold out meanwhile, and change the others', async () => {
      const lavande = await publish({ title: 'Lavande', inventory: 5 })
      const guest = await newGuest([
        { product: lavande.id, quantity: 4 },
        { product: tilleul.id, quantity: 1 },
      ])
      await setStock(lavande.id, 2)

      // The other line can still change.
      expect((await update(guest, await lineID(guest, tilleul.id), 2)).status).toBe(200)
      // Lowering the line is allowed, even while it is still over the stock; raising it is not.
      expect((await update(guest, await lineID(guest, lavande.id), 3)).status).toBe(200)
      expect((await update(guest, await lineID(guest, lavande.id), 4)).status).toBe(400)
      expect((await add(guest, lavande.id, 1)).status).toBe(400)
      expect(await quantities(guest)).toEqual([3, 2])

      await setStock(lavande.id, 0)
      expect((await update(guest, await lineID(guest, tilleul.id), 1)).status).toBe(200)
      expect((await remove(guest, await lineID(guest, lavande.id))).status).toBe(200)
      expect(await quantities(guest)).toEqual([1])
    })

    it('keeps a line whose product was unpublished meanwhile, without letting it grow', async () => {
      const menthe = await publish({ title: 'Menthe', inventory: 10 })
      const guest = await newGuest([
        { product: menthe.id, quantity: 2 },
        { product: tilleul.id, quantity: 1 },
      ])
      await payload.update({ collection: 'products', id: menthe.id, data: { _status: 'draft' }, overrideAccess: true })
      expect((await rest(`/api/products/${menthe.id}`)).status).toBe(404)

      expect((await update(guest, await lineID(guest, tilleul.id), 3)).status).toBe(200)
      expect((await add(guest, menthe.id, 1)).status).toBe(400)
      expect((await update(guest, await lineID(guest, menthe.id), 1)).status).toBe(200)
      expect(await quantities(guest)).toEqual([1, 3])
    })

    it('drops a line whose product went to the trash at the next change, so the cart keeps working', async () => {
      const sauge = await publish({ title: 'Sauge', inventory: 10 })
      const guest = await newGuest([
        { product: sauge.id, quantity: 2 },
        { product: tilleul.id, quantity: 1 },
      ])
      await payload.update({ collection: 'products', id: sauge.id, data: { deletedAt: new Date().toISOString() }, overrideAccess: true })
      expect((await update(guest, await lineID(guest, tilleul.id), 2)).status).toBe(200)
      const cart = await stored(guest)
      expect(cart.items?.map((item) => item.product)).toEqual([tilleul.id])
      expect(cart.subtotal).toBe(2 * 850)
    })
  })
})
