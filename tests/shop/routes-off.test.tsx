import { afterEach, describe, expect, it } from 'vitest'

import { getLightConfig } from '@/config'

// With the shop off, its routes answer 404 before importing anything of the shop. This runs in
// every CI setup (not inside describeWithShop): it switches the shop off itself, with the CI-only
// module override, and puts the setup back afterwards.

const NOT_FOUND = { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }

describe('shop routes with the shop off', () => {
  const previous = process.env.LIGHT_CI_MODULES

  afterEach(() => {
    if (previous === undefined) delete process.env.LIGHT_CI_MODULES
    else process.env.LIGHT_CI_MODULES = previous
  })

  const shopOff = () => {
    process.env.LIGHT_CI_MODULES = 'cms'
    expect(getLightConfig().modules.shop).toBe(false)
  }

  it('answers 404 for the product list, with no metadata', async () => {
    shopOff()
    const route = await import('@/app/(frontend)/[locale]/shop/page')
    const params = Promise.resolve({ locale: 'fr' })
    await expect(route.default({ params })).rejects.toMatchObject(NOT_FOUND)
    expect(await route.generateMetadata({ params })).toEqual({})
  })

  it('answers 404 for a product page, with no metadata', async () => {
    shopOff()
    const route = await import('@/app/(frontend)/[locale]/shop/[slug]/page')
    const params = Promise.resolve({ locale: 'fr', slug: 'tilleul' })
    await expect(route.default({ params })).rejects.toMatchObject(NOT_FOUND)
    expect(await route.generateMetadata({ params })).toEqual({})
  })

  it('answers 404 for the cart, with no metadata', async () => {
    shopOff()
    const route = await import('@/app/(frontend)/[locale]/cart/page')
    const params = Promise.resolve({ locale: 'fr' })
    await expect(route.default({ params })).rejects.toMatchObject(NOT_FOUND)
    expect(await route.generateMetadata({ params })).toEqual({})
  })

  it('answers 404 for the checkout and its "payment received" page, with no metadata', async () => {
    shopOff()
    const params = Promise.resolve({ locale: 'fr' })
    for (const route of [await import('@/app/(frontend)/[locale]/checkout/page'), await import('@/app/(frontend)/[locale]/checkout/received/page')]) {
      await expect(route.default({ params })).rejects.toMatchObject(NOT_FOUND)
      expect(await route.generateMetadata({ params })).toEqual({})
    }
  })

  it('answers 404 on the checkout’s return path, without confirming anything', async () => {
    shopOff()
    const route = await import('@/app/(frontend)/[locale]/checkout/return/route')
    const res = await route.GET(new Request('http://localhost/fr/checkout/return?payment_intent=pi_123'), { params: Promise.resolve({ locale: 'fr' }) })
    expect(res.status).toBe(404)
  })

  it('answers 404 for an order’s confirmation page, with no metadata', async () => {
    shopOff()
    const route = await import('@/app/(frontend)/[locale]/order/[id]/page')
    const params = Promise.resolve({ locale: 'fr', id: '1' })
    await expect(route.default({ params, searchParams: Promise.resolve({ token: 'x' }) })).rejects.toMatchObject(NOT_FOUND)
    expect(await route.generateMetadata({ params })).toEqual({})
  })

  it('answers 404 for an unknown locale with the shop on too', async () => {
    process.env.LIGHT_CI_MODULES = 'shop'
    const route = await import('@/app/(frontend)/[locale]/shop/[slug]/page')
    await expect(route.default({ params: Promise.resolve({ locale: 'zz', slug: 'tilleul' }) })).rejects.toMatchObject(NOT_FOUND)
  })
})
