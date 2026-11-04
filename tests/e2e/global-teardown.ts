import { rmSync } from 'node:fs'

import { e2e } from './support/env'

/** Deletes this run's database and media folder. The next run starts from a fresh seed anyway. */
export default function globalTeardown() {
  rmSync(e2e.dataDir, { recursive: true, force: true })
}
