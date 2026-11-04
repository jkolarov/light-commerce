// `pnpm email:test <address>`: sends a test email through the configured transport.
// Without SMTP_HOST it only logs the email (see src/core/email).
import { getPayload } from 'payload'

import config from '@payload-config'

const to = process.argv[2]
if (!to || !to.includes('@')) {
  console.error('Usage: pnpm email:test <address>')
  process.exit(1)
}

const payload = await getPayload({ config })
try {
  await payload.sendEmail({
    to,
    subject: 'Test email',
    text: 'This is a test email. Your email settings work.',
    html: '<p>This is a test email. Your email settings work.</p>',
  })
  payload.logger.info(`Test email handed to the email transport for ${to}.`)
} catch (error) {
  payload.logger.error(error, 'The test email could not be sent.')
  process.exitCode = 1
}
process.exit(process.exitCode ?? 0)
