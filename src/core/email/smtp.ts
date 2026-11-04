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

/**
 * How long the transport waits at each step (connecting, the server's greeting, any quiet moment
 * on the socket) before it gives up on a mail server, instead of nodemailer's minutes (up to 10).
 * It bounds each step, not a whole send: one email to a server that stops answering gives up after
 * about 10 s per stuck step, and an order sends two emails one after the other. So a graceful stop
 * needs a grace of a few tens of seconds to drain them (the demo's compose sets 30 s; Docker's
 * default is 10 s), and a server that answers slowly but steadily is not bounded at all. What a
 * hard kill mid-send loses stays at most once (src/modules/shop/emails/send.ts).
 */
export const SMTP_TIMEOUT_MS = 10_000

/** The nodemailer transport options for `smtp`: TLS from the start on port 465, timeouts always. */
export function smtpTransportOptions(smtp: SmtpSettings) {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    ...(smtp.auth ? { auth: smtp.auth } : {}),
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  }
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
