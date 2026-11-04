import { defineLightConfig } from './define'
import { LightConfigError } from './errors'
import type { LightConfig } from './schema'

/**
 * CI only: switches modules on and off without editing light.config.ts, so CI can prove each
 * module works alone (both, `cms`, `shop`). A comma-separated list of the modules to switch on;
 * unset or empty means light.config.ts decides. A site never sets it: modules are switched in
 * light.config.ts.
 */
export const MODULES_OVERRIDE_ENV = 'LIGHT_CI_MODULES'

const moduleNames = ['cms', 'shop'] as const

/** Reads the override: `'cms'` → `{ cms: true, shop: false }`. `undefined` when there is none. */
export function parseModulesOverride(value: string | undefined): LightConfig['modules'] | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const names = value.split(',').map((name) => name.trim())
  const unknown = names.filter((name) => !(moduleNames as readonly string[]).includes(name))
  if (unknown.length > 0) {
    throw new LightConfigError(
      unknown.map(
        (name) =>
          `${MODULES_OVERRIDE_ENV}: unknown module ${JSON.stringify(name)}, expected a comma-separated list of cms and shop`,
      ),
      `The ${MODULES_OVERRIDE_ENV} environment variable`,
    )
  }
  return { cms: names.includes('cms'), shop: names.includes('shop') }
}

/** The config with the override's modules, checked again (the shop still needs its section). */
export function applyModulesOverride(config: LightConfig, value: string | undefined): LightConfig {
  const modules = parseModulesOverride(value)
  if (!modules) return config
  return defineLightConfig({ ...config, modules })
}
