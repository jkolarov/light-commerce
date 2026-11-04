// The end-to-end test's settings, read once by playwright.config.ts and again by each test worker
// (which inherits the runner's environment). Two ways to pay:
//
// - `E2E_STRIPE=real` (the default outside CI): Stripe's test mode. The keys come from .env
//   (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, test keys only) and the Stripe CLI
//   (`stripe` on the PATH, or STRIPE_CLI) forwards Stripe's webhooks to the dev server.
// - `E2E_STRIPE=stub` (the default in CI, which has no Stripe keys): a fake Stripe in
//   tests/e2e/stripe-stub/, and no request leaves the machine.
//
// Each run gets its own database and media folder, under the OS temp folder, seeded with the demo
// (`pnpm seed`) before the server starts and deleted afterwards (global-teardown.ts).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseEnv } from 'node:util'

import lightConfig from '../../../light.config'

export type StripeMode = 'real' | 'stub'

const root = path.resolve(import.meta.dirname, '../../..')

if (!lightConfig.shop) throw new Error('light.config.ts has no `shop` section: the end-to-end test buys something, so it needs the shop.')
const { shipping } = lightConfig.shop

function stripeMode(): StripeMode {
  const mode = process.env.E2E_STRIPE || (process.env.CI ? 'stub' : 'real')
  if (mode !== 'real' && mode !== 'stub') throw new Error(`E2E_STRIPE is "${mode}": use "real" (Stripe's test mode) or "stub" (a fake Stripe).`)
  return mode
}

const mode = stripeMode()
const port = Number(process.env.E2E_PORT || 3100)
const baseURL = `http://localhost:${port}`
const stubPort = port + 1

/** The Stripe settings of a real run: test keys from the environment or .env, and the CLI's signing secret. */
function realStripe() {
  const dotenvFile = path.join(root, '.env')
  const dotenv = existsSync(dotenvFile) ? parseEnv(readFileSync(dotenvFile, 'utf8')) : {}
  const read = (name: string) => (process.env[name] || dotenv[name] || '').trim()
  const secretKey = read('STRIPE_SECRET_KEY')
  const publishableKey = read('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY')
  // Test mode only: a live key would charge real cards.
  if (!secretKey.startsWith('sk_test_') || !publishableKey.startsWith('pk_test_')) {
    throw new Error(
      'E2E_STRIPE=real (the default outside CI) pays in Stripe test mode: set STRIPE_SECRET_KEY (sk_test_…) and ' +
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_…) in .env. Without Stripe keys, run the fake Stripe: E2E_STRIPE=stub pnpm test:e2e',
    )
  }
  const cli = process.env.STRIPE_CLI || 'stripe'
  // The CLI's signing secret is the same on every run. Asked once: workers inherit it.
  if (!process.env.E2E_STRIPE_SIGNING_SECRET) {
    try {
      process.env.E2E_STRIPE_SIGNING_SECRET = execFileSync(cli, ['listen', '--print-secret'], {
        env: { ...process.env, STRIPE_API_KEY: secretKey },
        encoding: 'utf8',
      }).trim()
    } catch (error) {
      throw new Error(`E2E_STRIPE=real needs the Stripe CLI (${cli}; set STRIPE_CLI to its path): ${(error as Error).message}`)
    }
  }
  return { cli, secretKey, publishableKey, signingSecret: process.env.E2E_STRIPE_SIGNING_SECRET }
}

const real = mode === 'real' ? realStripe() : null

// Placeholders: nothing calls Stripe with them (the stub ignores keys).
const stub = {
  secretKey: 'e2e-stub-secret-key',
  publishableKey: 'e2e-stub-publishable-key',
  signingSecret: 'e2e-stub-signing-secret',
}

const dataDir = path.join(tmpdir(), `light-commerce-e2e-${port}`)
const webhookPath = '/api/payments/stripe/webhooks'

export const e2e = {
  mode,
  root,
  port,
  baseURL,
  /** The fake Stripe API (stub runs only). */
  stubURL: `http://127.0.0.1:${stubPort}`,
  stubPort,
  /** This run's database and media folder. */
  dataDir,
  webhookPath,
  /** Signs the webhooks the test sends itself (the CLI's secret, or the stub's). */
  signingSecret: real?.signingSecret ?? stub.signingSecret,
  stripeCli: real?.cli ?? 'stripe',
  stripeSecretKey: real?.secretKey ?? stub.secretKey,
  /**
   * The owner account the seed creates in this run's own database, which only this run's server on
   * localhost uses. The password passes the seed's check (12+ characters, no common word).
   */
  owner: { email: 'e2e-owner@example.com', password: 'Lc-e2e-Owner-7Kq2v' },
  /** The flat shipping rate in light.config.ts, in cents: added to every order. */
  shipping: shipping.flatRate,
}

/** The environment of the seed and the dev server. Next.js and Payload still read .env, but never over these. */
export function serverEnv(): Record<string, string> {
  const stripe = real ?? stub
  return {
    // Design 4.9: the end-to-end test runs with both modules on.
    LIGHT_CI_MODULES: 'cms,shop',
    DATABASE_URI: `file:${path.join(dataDir, 'e2e.db')}`,
    MEDIA_DIR: path.join(dataDir, 'media'),
    PAYLOAD_SECRET: 'e2e-placeholder-payload-secret',
    NEXT_PUBLIC_SERVER_URL: baseURL,
    NEXT_TELEMETRY_DISABLED: '1',
    SEED_OWNER_EMAIL: e2e.owner.email,
    SEED_OWNER_PASSWORD: e2e.owner.password,
    STRIPE_SECRET_KEY: stripe.secretKey,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripe.publishableKey,
    STRIPE_WEBHOOKS_SIGNING_SECRET: stripe.signingSecret,
    ...(mode === 'stub'
      ? {
          STRIPE_STUB_PORT: String(stubPort),
          STRIPE_STUB_WEBHOOK_URL: `${baseURL}${webhookPath}`,
          // The dev server's requests for api.stripe.com go to the stub.
          NODE_OPTIONS: `--no-deprecation --import=${JSON.stringify(path.join(root, 'tests/e2e/stripe-stub/redirect.ts'))}`,
        }
      : { NODE_OPTIONS: '--no-deprecation' }),
  }
}
