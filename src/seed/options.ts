import path from 'node:path'

import { SeedError } from './errors'

export type SeedOwner = { email: string; password: string }

export type SeedOptions = {
  /** The demo content: `demo/` in the working directory. */
  demoDir: string
  /** Delete all content (user accounts excepted) before loading, even content the demo doesn't have. */
  force: boolean
  /** The owner account, from SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD. */
  owner: SeedOwner
}

export const USAGE = 'Usage: pnpm seed [--force]'

/** Reads `pnpm seed`'s arguments and environment. Never repeats the password in a message. */
export function seedOptions(argv: readonly string[], env: Record<string, string | undefined>): SeedOptions {
  const problems: string[] = []
  const unknown = argv.filter((arg) => arg !== '--force')
  if (unknown.length) problems.push(`unknown option ${unknown.join(' ')}. ${USAGE}`)

  const email = env.SEED_OWNER_EMAIL?.trim() ?? ''
  const password = env.SEED_OWNER_PASSWORD ?? ''
  const inEnv = '(in .env, see .env.example)'
  if (!email) problems.push(`SEED_OWNER_EMAIL is not set ${inEnv}: the email address of the owner account to create`)
  else if (!/^[^\s@]+@[^\s@]+$/.test(email)) problems.push(`SEED_OWNER_EMAIL is not an email address: ${JSON.stringify(email)}`)
  if (!password) problems.push(`SEED_OWNER_PASSWORD is not set ${inEnv}: the password of the owner account to create`)

  if (problems.length) throw new SeedError('The seed cannot start:', problems)
  return { demoDir: path.resolve('demo'), force: argv.includes('--force'), owner: { email, password } }
}
