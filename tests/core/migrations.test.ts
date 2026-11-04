import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getLightConfig } from '@/config'
import { migrations } from '@/migrations'

import { startPayload, type TestPayload } from '../support/payload'

// The migrations in src/migrations/ are what a production database gets (`prodMigrations`:
// containers never push the schema). So the latest migration's snapshot must describe the schema
// the code has now, the way `pnpm payload migrate:create` compares them. A change to collections or
// fields without a new migration fails here, not on the demo. Run with both modules on, the setup
// the migrations are made in (a module that's off only leaves tables unused).

const dir = path.resolve('src/migrations')
const modules = getLightConfig().modules

type DrizzleKit = {
  generateDrizzleJson: (schema: unknown) => Promise<unknown> | unknown
  generateMigration: (before: unknown, after: unknown) => Promise<string[]>
}

describe.skipIf(!(modules.cms && modules.shop))('database migrations', () => {
  let test: TestPayload
  let payload: Payload

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('lists every migration file in src/migrations/index.ts, in order', () => {
    const files = readdirSync(dir)
      .filter((file) => /^\d{8}_\d{6}.*\.ts$/.test(file))
      .map((file) => file.replace(/\.ts$/, ''))
      .sort()
    expect(files.length).toBeGreaterThan(0)
    expect(migrations.map((migration) => migration.name)).toEqual(files)
  })

  it('has a latest migration that matches the schema (else: pnpm payload migrate:create <name>)', async () => {
    const latest = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .at(-1)!
    const before = JSON.parse(readFileSync(path.join(dir, latest), 'utf8'))
    const db = payload.db as unknown as { schema: unknown; requireDrizzleKit: () => Promise<DrizzleKit> }
    const kit = await db.requireDrizzleKit()
    const after = await kit.generateDrizzleJson(db.schema)
    expect(await kit.generateMigration(before, after)).toEqual([])
  })
})
