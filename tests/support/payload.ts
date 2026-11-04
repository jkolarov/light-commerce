import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Payload } from 'payload'

export type TestPayload = {
  payload: Payload
  /** Closes Payload, restores the environment and deletes the temporary database. */
  stop: () => Promise<void>
}

/**
 * Boots the composed Payload config (`src/payload.config.ts`) against a fresh SQLite file in the
 * OS temp dir. Outside production Payload pushes the schema on init, so the empty file is enough.
 *
 * - Call it once per test file, in `beforeAll`, and call `stop()` in `afterAll`. The config reads
 *   its environment when it is first imported, and Payload caches its instance, so a second boot
 *   in the same file would reuse the first one.
 * - Don't import `@/payload.config` statically in a file that uses this helper, for the same reason.
 * - `env` sets extra variables before the config is imported (for example a module setup).
 */
export async function startPayload(env: Record<string, string> = {}): Promise<TestPayload> {
  const dir = mkdtempSync(path.join(tmpdir(), 'lc-test-'))
  const vars: Record<string, string> = {
    DATABASE_URI: `file:${path.join(dir, 'test.db')}`,
    PAYLOAD_SECRET: 'test-only-secret',
    ...env,
  }
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]))
  Object.assign(process.env, vars)

  const cleanUp = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(dir, { recursive: true, force: true })
  }

  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('@/payload.config')
    const payload = await getPayload({ config })
    return {
      payload,
      stop: async () => {
        await payload.destroy()
        cleanUp()
      },
    }
  } catch (error) {
    cleanUp()
    throw error
  }
}
