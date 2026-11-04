// `payload run src/seed/reset-cli.ts`: the demo's nightly reset (./reset.ts) on the database in
// DATABASE_URI. On the demo it runs in the stack: deploy/demo/reset.sh, scheduled every night (see
// deploy/demo/README.md). Needs SEED_OWNER_EMAIL, never the owner's password: the owner must exist.
import { getPayload } from 'payload'

import config from '@payload-config'

import { SeedError } from './errors'
import { seedOptions } from './options'
import { resetDemo } from './reset'

let code = 0
try {
  const args = process.argv.slice(2)
  if (args.length) throw new SeedError('The reset cannot start:', [`it takes no options (got ${args.join(' ')})`])
  // The owner is looked up, never created here: the password is left out on purpose.
  const options = seedOptions([], { ...process.env, SEED_OWNER_PASSWORD: undefined })
  const payload = await getPayload({ config })
  try {
    const started = Date.now()
    const summary = await resetDemo(payload, { demoDir: options.demoDir, owner: options.owner })
    payload.logger.info(`Reset: done in ${Math.round((Date.now() - started) / 1000)} s (owner ${summary.seed.owner}, ${summary.seed.products} products, ${summary.seed.pages} pages).`)
  } finally {
    await payload.destroy()
  }
} catch (error) {
  code = 1
  console.error(error instanceof SeedError ? `\n${error.message}\n` : error)
}
process.exit(code)
