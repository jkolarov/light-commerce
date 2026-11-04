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

describe('setup: both modules', () => {
  let test: TestPayload
  let payload: Payload
  // Vitest clears spies before each test, so keep the calls made while booting.
  let pluginCalls: { cms: unknown[][]; shop: unknown[][] }

  beforeAll(async () => {
    test = await startPayload({ LIGHT_CI_MODULES: 'cms,shop' })
    payload = test.payload
    pluginCalls = { cms: [...vi.mocked(cmsPlugin).mock.calls], shop: [...vi.mocked(shopPlugin).mock.calls] }
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('boots with both modules on', () => {
    expect(payload.config.admin.user).toBe('users')
    expect(getLightConfig().modules).toEqual({ cms: true, shop: true })
  })

  it('adds both plugins', () => {
    const config = getLightConfig()
    expect(pluginCalls).toEqual({ cms: [[{ config }]], shop: [[{ config }]] })
  })

  it('writes its types to the committed src/payload-types.ts', () => {
    // Only this setup has every collection, so only it may write the committed file.
    expect(payload.config.typescript.outputFile).toBe(path.resolve('src/payload-types.ts'))
  })
})
