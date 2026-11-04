// Next.js calls `register` once when the server starts (`next dev`, `next start`, the Docker
// image). Node.js only: the checks use Node APIs, so the edge build must not import them.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { stopIfConfigIsBroken } = await import('./config/startup')
    await stopIfConfigIsBroken()
    const { stopIfSmtpIsMissing } = await import('./core/email/startup')
    stopIfSmtpIsMissing()
    if (await moduleIsOn('shop')) {
      const { stopIfStripeIsMissing } = await import('./modules/shop/payments/stripe/startup')
      stopIfStripeIsMissing()
    }
    // Last: a production server applies pending migrations before it answers, and stops if one
    // fails (src/core/dbStartup.ts). Not during `next build` or `next dev`.
    const { preparesDatabaseAtStartup, prepareDatabaseOrStop } = await import('./core/dbStartup')
    if (preparesDatabaseAtStartup()) await prepareDatabaseOrStop(startPayload)
  }
}

/** Payload's start: connects to the database and applies pending migrations (`prodMigrations`). */
async function startPayload() {
  const { getPayload } = await import('payload')
  const { default: config } = await import('@payload-config')
  await getPayload({ config })
}

/** Whether a module is on. A broken config counts as off: `stopIfConfigIsBroken` has reported it. */
async function moduleIsOn(name: 'cms' | 'shop'): Promise<boolean> {
  try {
    const { getLightConfig } = await import('./config')
    return getLightConfig().modules[name]
  } catch {
    return false
  }
}
