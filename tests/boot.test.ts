import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPayload, type TestPayload } from './support/payload'

// Boots the composed Payload config (core + cms + shop) against a fresh SQLite file.
describe('Payload boots', () => {
  let test: TestPayload
  let payload: Payload

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('localizes content in fr and en, defaults to fr and falls back to it', () => {
    const { localization } = payload.config
    expect(localization).not.toBe(false)
    if (!localization) return
    expect(localization.localeCodes).toEqual(['fr', 'en'])
    expect(localization.defaultLocale).toBe('fr')
    expect(localization.fallback).toBe(true)
  })

  it('offers the admin in French and English', () => {
    expect(Object.keys(payload.config.i18n.supportedLanguages ?? {}).sort()).toEqual(['en', 'fr'])
  })

  it('logs into the admin with the users collection', () => {
    expect(payload.config.admin.user).toBe('users')
    expect(payload.collections.users?.config.auth).toBeTruthy()
  })

  it('does not regenerate src/payload-types.ts when tests boot Payload', () => {
    // Outside production Payload rewrites the types on init. `pnpm generate` owns that file.
    expect(payload.config.typescript.autoGenerate).toBe(false)
  })

  it('reads and writes the database through the Local API', async () => {
    const before = await payload.find({ collection: 'users', overrideAccess: true })
    expect(before.totalDocs).toBe(0)

    await payload.create({
      collection: 'users',
      data: { email: 'boot-test@example.com', password: 'boot-test-password' },
      overrideAccess: true,
    })

    const after = await payload.count({ collection: 'users', overrideAccess: true })
    expect(after.totalDocs).toBe(1)
  })
})
