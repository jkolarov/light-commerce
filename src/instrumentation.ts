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
  }
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
