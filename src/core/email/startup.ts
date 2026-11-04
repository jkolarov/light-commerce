import { missingSmtpProblem } from './smtp'

/** Called at startup by src/instrumentation.ts: stops a production server that has no SMTP_HOST. */
export function stopIfSmtpIsMissing(env: Record<string, string | undefined> = process.env): void {
  const problem = missingSmtpProblem(env)
  if (!problem) return
  console.error(`\n${problem}\n`)
  process.exit(1)
}
