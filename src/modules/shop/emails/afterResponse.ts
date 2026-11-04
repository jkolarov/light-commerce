import { after } from 'next/server'

/** Where `afterResponse` warns; `payload.logger` fits. */
type Logger = { warn: (log: { err?: unknown; msg: string }) => void }

/** Next's `after`, called outside a request: the normal case in a script or a test. */
const outsideRequest = (error: unknown) => error instanceof Error && error.message.includes('outside a request scope')

/**
 * Runs `task` once the response has gone out, when called while Next answers a request (a route
 * handler, a Server Action, Payload's REST endpoints): Next's `after`. Anywhere else (a script
 * such as the reconcile job, a test) Next's `after` throws without scheduling anything, so `task`
 * runs right away and is awaited. If Next refuses for any other reason, that is logged as a
 * warning, and `task` runs right away too.
 *
 * `task` must not throw: Next only logs what an `after` task throws.
 */
export async function afterResponse(task: () => Promise<void>, logger: Logger): Promise<void> {
  try {
    after(task)
    return
  } catch (error) {
    // Nothing was scheduled.
    if (!outsideRequest(error)) logger.warn({ err: error, msg: 'Shop: Next’s `after` refused a task; it runs now instead.' })
  }
  await task()
}
