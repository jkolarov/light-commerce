// `pnpm seed [--force]`: loads the demo company from demo/ into the database in DATABASE_URI.
// Run by `payload run` (package.json), which loads .env. See src/seed/index.ts for what it does.
import { getPayload } from 'payload'

import config from '@payload-config'

import { seedDemo } from './index'
import { SeedError } from './errors'
import { seedOptions } from './options'

let code = 0
try {
  // Options first: a bad command line or a missing variable stops before Payload starts.
  const options = seedOptions(process.argv.slice(2), process.env)
  const payload = await getPayload({ config })
  try {
    await seedDemo(payload, { ...options, target: options.database })
  } finally {
    await payload.destroy()
  }
} catch (error) {
  code = 1
  // A SeedError says what to do in plain words; anything else keeps its stack.
  console.error(error instanceof SeedError ? `\n${error.message}\n` : error)
}
process.exit(code)
