import { after } from 'next/server'

/**
 * Runs `task` once the response has gone out, when called while Next answers a request (a route
 * handler, a Server Action, Payload's REST endpoints): Next's `after`. Anywhere else (a script
 * such as the reconcile job, a test) Next's `after` throws without scheduling anything, so `task`
 * runs right away and is awaited.
 *
 * `task` must not throw: Next only logs what an `after` task throws.
 */
export async function afterResponse(task: () => Promise<void>): Promise<void> {
  try {
    after(task)
    return
  } catch {
    // Not in a request: nothing was scheduled.
  }
  await task()
}
