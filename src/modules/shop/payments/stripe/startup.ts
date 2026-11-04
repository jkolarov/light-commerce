import { missingPublishableKeyWarning, missingStripeProblem } from './env'

/**
 * Called at startup by src/instrumentation.ts when the shop is on: stops a server that has no
 * Stripe secret key or no webhook signing secret, in development and production alike, and warns
 * when the card form has no publishable key.
 */
export function stopIfStripeIsMissing(env: Record<string, string | undefined> = process.env): void {
  const warning = missingPublishableKeyWarning(env)
  if (warning) console.warn(warning)
  const problem = missingStripeProblem(env)
  if (!problem) return
  console.error(`\n${problem}\n`)
  process.exit(1)
}
