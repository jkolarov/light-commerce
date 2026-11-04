// light.config.ts imports this folder's index.ts, which imports this file, which imports
// light.config.ts. That cycle is safe as long as this file only reads `rootConfig` inside
// functions, and index.ts exports this file last (see there).
import rootConfig from '../../light.config'

import { applyModulesOverride, MODULES_OVERRIDE_ENV } from './modulesOverride'
import type { LightConfig } from './schema'

let cached: { override: string | undefined; config: LightConfig } | undefined

/** The site's validated settings: light.config.ts, with the CI-only module override applied. */
export function getLightConfig(): LightConfig {
  const override = process.env[MODULES_OVERRIDE_ENV]
  if (!cached || cached.override !== override) {
    cached = { override, config: applyModulesOverride(rootConfig, override) }
  }
  return cached.config
}
