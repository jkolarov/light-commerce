// The settings of light.config.ts: schema, `defineLightConfig` (used by light.config.ts itself)
// and `getLightConfig` (used by everything else).
//
// Keep `./load` last. It imports light.config.ts, which imports this file and calls
// `defineLightConfig` straight away, so everything above must already be loaded by then.
export { defineLightConfig } from './define'
export { LightConfigError } from './errors'
export { lightConfigSchema, type LightConfig, type LightConfigInput, type ShopConfig } from './schema'
export { getLightConfig } from './load'
