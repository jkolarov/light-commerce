// Reads the SMTP settings from the environment. Pure: takes the environment as an argument.
export type SmtpSettings = {
  host: string
  port: number
  /** Set only when both SMTP_USER and SMTP_PASS are. */
  auth?: { user: string; pass: string }
}

type Env = Record<string, string | undefined>

/** The settings, or null when SMTP_HOST is not set. Throws on a port that is not a number. */
export function readSmtpSettings(env: Env = process.env): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim()
  if (!host) return null
  const rawPort = env.SMTP_PORT?.trim()
  const port = rawPort ? Number(rawPort) : 587
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SMTP_PORT must be a port number (1-65535), got "${rawPort}".`)
  }
  const user = env.SMTP_USER?.trim()
  const pass = env.SMTP_PASS
  if (Boolean(user) !== Boolean(pass)) {
    throw new Error(
      `SMTP_USER and SMTP_PASS go together: ${user ? 'SMTP_PASS is' : 'SMTP_USER is'} missing. ` +
        'Set both, or neither for a server without a login.',
    )
  }
  return { host, port, ...(user && pass ? { auth: { user, pass } } : {}) }
}

/** A display name that cannot break out of the From header: no quotes, commas, angle brackets or line breaks (the adapter builds the header as a plain string). */
export function safeSenderName(name: string): string {
  return name.replace(/[\r\n",;:<>]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The message to show when the server runs in production without SMTP_HOST, or null if all is well. */
export function missingSmtpProblem(env: Env = process.env): string | null {
  if (env.NODE_ENV !== 'production' || env.SMTP_HOST?.trim()) return null
  return (
    'SMTP_HOST is not set, and the server runs in production: it could not send any email ' +
    '(order confirmations, password resets). Set SMTP_HOST and SMTP_PORT, plus SMTP_USER and SMTP_PASS ' +
    'if the server needs a login. On the demo and in development, point them at Mailpit.'
  )
}
