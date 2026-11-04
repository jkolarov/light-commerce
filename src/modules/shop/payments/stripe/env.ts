// The Stripe settings, from the environment (test-mode keys for the demo). Pure: takes the
// environment as an argument. Read at runtime, never inlined at build time (the publishable key
// reaches the page as a prop), so an image built once runs with any keys.

type Env = Record<string, string | undefined>

export type StripeSettings = {
  /** `STRIPE_SECRET_KEY`: server only. */
  secretKey: string
  /** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: loads Stripe's form in the browser. */
  publishableKey: string
  /** `STRIPE_WEBHOOKS_SIGNING_SECRET`: checks that a webhook comes from Stripe. */
  webhookSecret: string
}

/** The variables a server with the shop on cannot run without. */
export const REQUIRED_STRIPE_VARIABLES = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOKS_SIGNING_SECRET'] as const

const read = (env: Env, name: string) => env[name]?.trim() ?? ''

/** The settings; a missing one is `''` (the startup check stops a server without the required ones). */
export function readStripeSettings(env: Env = process.env): StripeSettings {
  return {
    secretKey: read(env, 'STRIPE_SECRET_KEY'),
    publishableKey: read(env, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
    webhookSecret: read(env, 'STRIPE_WEBHOOKS_SIGNING_SECRET'),
  }
}

/** The message to show when a required variable is missing, or null if all are set. */
export function missingStripeProblem(env: Env = process.env): string | null {
  const missing = REQUIRED_STRIPE_VARIABLES.filter((name) => !read(env, name))
  if (missing.length === 0) return null
  return (
    `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set, and the shop is on. Without ` +
    'STRIPE_SECRET_KEY no payment can start; without STRIPE_WEBHOOKS_SIGNING_SECRET the Stripe webhook ' +
    'answers 200 and drops every event, so paid orders would be lost. Set both in .env (test keys from ' +
    "Stripe's dashboard, and the signing secret from `stripe listen` or the webhook endpoint), or switch " +
    'the shop off in light.config.ts.'
  )
}
