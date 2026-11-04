import { isValidElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getLightConfig, type LightConfig } from '@/config'

const failing = vi.hoisted(() => ({ on: false }))

// The CMS's frontend exports, as stand-ins: this file checks how the frame uses them, not the menus
// themselves (tests/cms/menus.test.ts does). `failing.on` makes them throw like a broken database.
vi.mock('@/modules/cms/frontend', () => {
  const read = <T,>(value: T) => async () => {
    if (failing.on) throw new Error('no such table: header')
    return value
  }
  return {
    getHeaderNav: read([{ label: 'La ferme', href: '/fr/la-ferme' }]),
    getFooterNav: read([{ label: 'Mentions légales', href: '/fr/mentions-legales' }]),
    getFooterText: read('Combe-Rousse'),
  }
})

const { loadFrame } = await import('@/theme/frame')

const withModules = (modules: LightConfig['modules']): LightConfig => ({ ...getLightConfig(), modules })

describe('loadFrame', () => {
  afterEach(() => {
    failing.on = false
    vi.restoreAllMocks()
  })

  it('reads the menus and the footer text from the CMS when it is on', async () => {
    const frame = await loadFrame('fr', withModules({ cms: true, shop: false }))
    expect(frame.headerNav).toEqual([{ label: 'La ferme', href: '/fr/la-ferme' }])
    expect(frame.footerNav).toEqual([{ label: 'Mentions légales', href: '/fr/mentions-legales' }])
    expect(frame.footerText).toBe('Combe-Rousse')
    expect(frame.shop).toBe(false)
    expect(frame.cart).toBeNull()
  })

  it('has no CMS menus when the CMS is off', async () => {
    const frame = await loadFrame('fr', withModules({ cms: false, shop: true }))
    expect(frame).toMatchObject({ headerNav: [], footerNav: [], footerText: null, shop: true })
  })

  it("gives the header the shop's cart button when the shop is on", async () => {
    const frame = await loadFrame('en', withModules({ cms: false, shop: true }))
    expect(isValidElement(frame.cart)).toBe(true)
    const { CartButton } = await import('@/modules/shop/frontend')
    expect(frame.cart).toMatchObject({ type: CartButton, props: { locale: 'en' } })
  })

  it('still draws the frame, without the menus, when the CMS cannot be read', async () => {
    failing.on = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const frame = await loadFrame('fr', withModules({ cms: true, shop: false }))
    expect(frame).toMatchObject({ headerNav: [], footerNav: [], footerText: null })
    expect(log).toHaveBeenCalled()
  })
})
