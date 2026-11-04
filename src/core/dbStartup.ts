// The production server prepares its database as it starts (src/instrumentation.ts), instead of on
// the first request that needs Payload: pending migrations (src/migrations, `prodMigrations`) run
// before the server answers anything, `/healthz` included. A migration that fails stops the
// server, so Docker restarts it again and again and its health check never passes: a visible
// failure, where a lazy start would leave a healthy container whose every page is a 500.

type Env = Record<string, string | undefined>

/** Whether this process is a production server starting: not `next build`, not `next dev`. */
export function preparesDatabaseAtStartup(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production' && env.NEXT_PHASE !== 'phase-production-build'
}

/** Runs `init` (Payload's start, which applies pending migrations); stops the server if it fails. */
export async function prepareDatabaseOrStop(init: () => Promise<unknown>): Promise<void> {
  try {
    await init()
  } catch (error) {
    console.error('\nThe database could not be prepared (a migration in src/migrations failed, or the database is unreachable): the server stops.\n', error)
    process.exit(1)
  }
}
