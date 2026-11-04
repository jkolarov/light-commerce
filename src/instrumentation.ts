// Next.js calls `register` once when the server starts (`next dev`, `next start`, the Docker
// image). Node.js only: the check uses Node APIs, so the edge build must not import it.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { stopIfConfigIsBroken } = await import('./config/startup')
    await stopIfConfigIsBroken()
    const { stopIfSmtpIsMissing } = await import('./core/email/startup')
    stopIfSmtpIsMissing()
  }
}
