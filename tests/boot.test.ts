import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Boots the composed Payload config (core + cms + shop) against a fresh SQLite file.
// Payload pushes the schema itself outside production, so the empty file is enough.
describe('Payload boots', () => {
  let payload: Payload
  let dir: string

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'lc-boot-'))
    // The config reads these when it is imported, so set them first.
    process.env.DATABASE_URI = `file:${path.join(dir, 'test.db')}`
    process.env.PAYLOAD_SECRET = 'test-only-secret'

    const { getPayload } = await import('payload')
    const config = await (await import('@/payload.config')).default
    // Outside production, Payload regenerates src/payload-types.ts on init. Tests must not touch
    // committed files, so switch that off here (`pnpm generate` owns those files).
    payload = await getPayload({
      config: { ...config, typescript: { ...config.typescript, autoGenerate: false } },
    })
  }, 60_000)

  afterAll(async () => {
    await payload?.destroy()
    rmSync(dir, { recursive: true, force: true })
  })

  it('localizes content in fr and en, defaults to fr and falls back to it', () => {
    const { localization } = payload.config
    expect(localization).not.toBe(false)
    if (!localization) return
    expect(localization.localeCodes).toEqual(['fr', 'en'])
    expect(localization.defaultLocale).toBe('fr')
    expect(localization.fallback).toBe(true)
  })

  it('logs into the admin with the users collection', () => {
    expect(payload.config.admin.user).toBe('users')
    expect(payload.collections.users?.config.auth).toBeTruthy()
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
