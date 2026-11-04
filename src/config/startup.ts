/**
 * Stops the server when light.config.ts, or LIGHT_CI_MODULES, is broken, with the list of
 * problems in the log. Called once at startup by src/instrumentation.ts. On its own, Next.js
 * would log a failed startup hook and keep serving error pages.
 */
export async function stopIfConfigIsBroken(): Promise<void> {
  try {
    // A dynamic import: importing the config runs light.config.ts, which throws when it is broken.
    const { getLightConfig } = await import('./index')
    getLightConfig()
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'LightConfigError') throw error
    console.error(`\n${error.message}\n`)
    process.exit(1)
  }
}
