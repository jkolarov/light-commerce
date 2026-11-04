import path from 'node:path'

import { SeedError } from './errors'

/** The owner account. The password is needed only to create it: an existing owner keeps theirs. */
export type SeedOwner = { email: string; password?: string }

export type SeedOptions = {
  /** The demo content: `demo/` in the working directory. */
  demoDir: string
  /** DATABASE_URI, as messages show it (without a query string). */
  database: string
  /** Delete all content (user accounts excepted) before loading, even content the demo doesn't have. */
  force: boolean
  /** The owner account, from SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD. */
  owner: SeedOwner
}

export const USAGE = 'Usage: pnpm seed [--force]'

const DEFAULT_DATABASE = 'file:./data/light.db'

/** A DATABASE_URI without its query string, which could carry a token. */
const withoutQuery = (uri: string) => uri.replace(/\?.*$/, '')

/** The database's file name, what `SEED_CONFIRM_WIPE` must say: `file:/app/data/light.db` → `light.db`. */
export function databaseFileName(uri: string): string {
  return path.basename(withoutQuery(uri).replace(/^file:/, ''))
}

export const MIN_PASSWORD_LENGTH = 12

// Placeholders and the most common passwords, in English and French. Matched anywhere in the
// password, case and punctuation aside.
const WEAK_WORDS = ['changeme', 'password', 'passw0rd', 'motdepasse', 'secret', 'admin', 'letmein', 'welcome', 'qwerty', 'azerty', '123456', 'abcdef']

/**
 * Why a password must not become the site owner's, or `null` when it may. Never repeats the password.
 * The demo's owner password guards a public admin, so it has to be a real one.
 */
export function passwordProblem(password: string): string | null {
  const advice = 'it becomes the admin password of the site; use a random one, for example `openssl rand -base64 18`'
  if (password.length < MIN_PASSWORD_LENGTH) return `SEED_OWNER_PASSWORD is too short: at least ${MIN_PASSWORD_LENGTH} characters, ${advice}`
  const plain = password.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (WEAK_WORDS.some((word) => plain.includes(word)) || new Set(password).size < 4) {
    return `SEED_OWNER_PASSWORD looks like a placeholder or a common password: ${advice}`
  }
  return null
}

/** Reads `pnpm seed`'s arguments and environment. Never repeats the password in a message. */
export function seedOptions(argv: readonly string[], env: Record<string, string | undefined>): SeedOptions {
  const problems: string[] = []
  const unknown = argv.filter((arg) => arg !== '--force')
  if (unknown.length) problems.push(`unknown option ${unknown.join(' ')}. ${USAGE}`)
  const force = argv.includes('--force')
  const uri = env.DATABASE_URI || DEFAULT_DATABASE
  const database = withoutQuery(uri)

  // Payload stores emails in lowercase; looking the owner up with any other case would miss it.
  const email = env.SEED_OWNER_EMAIL?.trim().toLowerCase() ?? ''
  const password = env.SEED_OWNER_PASSWORD || undefined
  if (!email) problems.push('SEED_OWNER_EMAIL is not set (in .env, see .env.example): the email address of the owner account')
  else if (!/^[^\s@]+@[^\s@]+$/.test(email)) problems.push(`SEED_OWNER_EMAIL is not an email address: ${JSON.stringify(email)}`)
  const weak = password === undefined ? null : passwordProblem(password)
  if (weak) problems.push(weak)

  // --force cannot be undone: it needs a second, specific signal, in every environment (production too).
  const name = databaseFileName(uri)
  if (force && env.SEED_CONFIRM_WIPE !== name) {
    problems.push(
      `--force deletes all content (pages, products, photos and their files, carts, orders, transactions; user accounts are kept) from ${database}. ` +
        `To confirm, also set SEED_CONFIRM_WIPE=${name}, the name of that database file.`,
    )
  }

  if (problems.length) throw new SeedError('The seed cannot start:', problems)
  return { demoDir: path.resolve('demo'), database, force, owner: password === undefined ? { email } : { email, password } }
}
