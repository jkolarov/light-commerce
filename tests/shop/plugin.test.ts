import { handleEndpoints, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, expect, it } from 'vitest'

import type { User } from '@/payload-types'

import { describeWithShop } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'

// The shop plugin: which of the ecommerce plugin's collections exist, what the admin shows of
// them, and that the public site stays guest-only.
describeWithShop('shop plugin', () => {
  let test: TestPayload
  let payload: Payload
  let owner: User
  let staff: User

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@example.com', password: 'pw-owner-1' },
      overrideAccess: true,
    })
    staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@example.com', password: 'pw-staff-1', roles: ['staff'] },
      overrideAccess: true,
    })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  const collection = (slug: string) => payload.config.collections.find((c) => c.slug === slug)
  const as = (user: User | null) =>
    ({ payload, user: user ? { ...user, collection: 'users' } : null }) as unknown as PayloadRequest

  it("adds the ecommerce plugin's collections with their default slugs, without variants", () => {
    const slugs = payload.config.collections.map((c) => c.slug)
    expect(slugs).toEqual(expect.arrayContaining(['products', 'carts', 'orders', 'transactions', 'addresses']))
    for (const slug of ['variants', 'variantTypes', 'variantOptions']) expect(slugs).not.toContain(slug)
  })

  it('prices products in euros, from shop.currency', () => {
    const names = JSON.stringify(collection('products')!.flattenedFields.map((f) => f.name))
    expect(names).toContain('"priceInEUR"')
    expect(names).toContain('"priceInEUREnabled"')
    expect(names).not.toContain('priceInUSD')
  })

  it('shows products and orders under the Shop group of the admin', () => {
    for (const slug of ['products', 'orders']) {
      const admin = collection(slug)!.admin
      expect(admin.group, slug).toEqual({ en: 'Shop', fr: 'Boutique' })
      expect(admin.hidden, slug).toBeFalsy()
    }
  })

  it('hides carts and addresses from the admin, and keeps no versions of carts', () => {
    expect(collection('carts')!.admin.hidden).toBe(true)
    expect(collection('addresses')!.admin.hidden).toBe(true)
    expect(collection('carts')!.versions).toBeFalsy()
    expect(collection('addresses')!.versions).toBeFalsy()
  })

  it('keeps transactions out of the navigation and read-only, even for the owner', async () => {
    const transactions = collection('transactions')!
    expect(transactions.admin.group).toBe(false)
    expect(transactions.versions).toBeFalsy()
    const { access } = transactions
    for (const operation of ['create', 'update', 'delete'] as const) {
      expect(await access[operation]!({ req: as(owner) } as never), operation).toBe(false)
    }
    expect(await access.read!({ req: as(staff) } as never)).toBe(true)
    expect(await access.read!({ req: as(null) } as never)).toBe(false)
  })

  it('lets staff manage orders, and nobody else read them', async () => {
    const { access } = collection('orders')!
    for (const operation of ['create', 'read', 'update', 'delete'] as const) {
      expect(await access[operation]!({ req: as(staff) } as never), operation).toBe(true)
      expect(await access[operation]!({ req: as(null) } as never), operation).toBe(false)
    }
    expect(await access.readVersions!({ req: as(null) } as never)).toBe(false)
  })

  it('lets a guest start a cart, reachable only with its secret', async () => {
    const cart = await payload.create({ collection: 'carts', data: { items: [], currency: 'EUR' }, overrideAccess: false })
    expect(cart.secret).toEqual(expect.any(String))
    await expect(payload.find({ collection: 'carts', overrideAccess: false })).rejects.toThrow(/not allowed/)
    const withSecret = await payload.find({ collection: 'carts', overrideAccess: false, context: { cartSecret: cart.secret } })
    expect(withSecret.docs.map((c) => c.id)).toEqual([cart.id])
    const withWrongSecret = await payload.find({ collection: 'carts', overrideAccess: false, context: { cartSecret: 'nope' } })
    expect(withWrongSecret.totalDocs).toBe(0)
  })

  it('has no customer sign-up: a guest cannot create a user, over REST or the Local API', async () => {
    const res = await handleEndpoints({
      config: payload.config,
      path: '/api/users',
      request: new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({ email: 'guest@example.com', password: 'pw-guest-1' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    })
    expect(res.status).toBe(403)
    await expect(
      payload.create({ collection: 'users', data: { email: 'guest2@example.com', password: 'pw-guest-2' }, overrideAccess: false }),
    ).rejects.toThrow()
    const { totalDocs } = await payload.count({ collection: 'users', overrideAccess: true })
    expect(totalDocs).toBe(2)
  })
})
