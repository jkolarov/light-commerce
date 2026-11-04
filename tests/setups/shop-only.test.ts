import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { getLightConfig } from '@/config'
import { cmsPlugin } from '@/modules/cms'
import { shopPlugin } from '@/modules/shop'

import { startPayload, type TestPayload } from '../support/payload'

// One setup per file: Payload boots once per test file (tests/support/payload.ts).
// The plugins are spies, so the test sees which ones src/payload.config.ts adds.
vi.mock('@/modules/cms', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/modules/cms')>()
  return { ...original, cmsPlugin: vi.fn(original.cmsPlugin) }
})
vi.mock('@/modules/shop', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/modules/shop')>()
  return { ...original, shopPlugin: vi.fn(original.shopPlugin) }
})

describe('setup: shop only', () => {
  let test: TestPayload
  let payload: Payload
  // Vitest clears spies before each test, so keep the calls made while booting.
  let pluginCalls: { cms: unknown[][]; shop: unknown[][] }

  beforeAll(async () => {
    test = await startPayload({ LIGHT_CI_MODULES: 'shop' })
    payload = test.payload
    pluginCalls = { cms: [...vi.mocked(cmsPlugin).mock.calls], shop: [...vi.mocked(shopPlugin).mock.calls] }
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('boots with the CMS switched off', () => {
    expect(payload.config.admin.user).toBe('users')
    expect(getLightConfig().modules).toEqual({ cms: false, shop: true })
  })

  it('adds the shop plugin and not the cms plugin', () => {
    const config = getLightConfig()
    expect(pluginCalls).toEqual({ cms: [], shop: [[{ config }]] })
  })

  it('never writes its types over the committed src/payload-types.ts', () => {
    // The committed file describes both modules; this setup's types go to a scratch file.
    expect(payload.config.typescript.outputFile).not.toBe(path.resolve('src/payload-types.ts'))
  })
})
