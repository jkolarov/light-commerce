import { formatProblems, LightConfigError } from './errors'
import { lightConfigSchema, type LightConfig, type LightConfigInput } from './schema'

/**
 * Checks the settings of light.config.ts and returns them. Throws `LightConfigError` listing every
 * problem, so a broken config fails its test, the build and startup with a clear message.
 */
export function defineLightConfig(input: LightConfigInput): LightConfig {
  // `reportInput` lets the error messages tell a missing setting from a wrong one.
  const result = lightConfigSchema.safeParse(input, { reportInput: true })
  if (!result.success) throw new LightConfigError(formatProblems(result.error.issues))
  return result.data
}
