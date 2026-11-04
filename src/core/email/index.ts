import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import type { EmailAdapter } from 'payload'

import type { LightConfig } from '@/config/schema'

import { readSmtpSettings, safeSenderName } from './smtp'

type Transport = NonNullable<Parameters<typeof nodemailerAdapter>[0]>['transport']

// Modules send with `payload.sendEmail({ to, subject, html, text })`. The sender is
// `email.fromName <email.fromAddress>` from light.config.ts; the transport comes from SMTP_* env.
//
// Without SMTP_HOST the email is logged instead of sent, so dev and tests work offline. In
// production that is a misconfiguration: `warnOrStopWithoutSmtp` (startup.ts) refuses to start.
export function emailAdapter(opts: {
  config: LightConfig
  env?: Record<string, string | undefined>
  /** Test hook: replaces the SMTP transport. */
  transport?: Transport
}): Promise<EmailAdapter> | EmailAdapter {
  const { fromAddress } = opts.config.email
  const fromName = safeSenderName(opts.config.email.fromName)
  const smtp = readSmtpSettings(opts.env ?? process.env)

  if (smtp || opts.transport) {
    return nodemailerAdapter({
      defaultFromName: fromName,
      defaultFromAddress: fromAddress,
      // Verifying would open a connection at every boot, and `next build` loads this config too.
      skipVerify: true,
      ...(opts.transport
        ? { transport: opts.transport }
        : smtp && {
            transportOptions: { host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: smtp.auth },
          }),
    })
  }

  return ({ payload }) => ({
    name: 'log',
    defaultFromName: fromName,
    defaultFromAddress: fromAddress,
    sendEmail: async (message) => {
      payload.logger.info(
        `Email not sent (no SMTP_HOST): from "${fromName} <${fromAddress}>" to ${String(message.to)}, ` +
          `subject "${String(message.subject)}"\n${String(message.text ?? message.html ?? '')}`,
      )
    },
  })
}
