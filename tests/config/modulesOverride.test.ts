import { afterEach, describe, expect, it } from 'vitest'

import { defineLightConfig, getLightConfig, LightConfigError } from '@/config'
import { applyModulesOverride, parseModulesOverride } from '@/config/modulesOverride'

import { validInput } from './fixtures/validInput'

describe('parseModulesOverride (LIGHT_CI_MODULES)', () => {
  it('means no override when unset or blank', () => {
    expect(parseModulesOverride(undefined)).toBeUndefined()
    expect(parseModulesOverride('')).toBeUndefined()
    expect(parseModulesOverride('  ')).toBeUndefined()
  })

  it('switches on exactly the modules it lists', () => {
    expect(parseModulesOverride('cms')).toEqual({ cms: true, shop: false })
    expect(parseModulesOverride('shop')).toEqual({ cms: false, shop: true })
    expect(parseModulesOverride('cms,shop')).toEqual({ cms: true, shop: true })
    expect(parseModulesOverride(' shop , cms ')).toEqual({ cms: true, shop: true })
  })

  it('rejects an unknown module name', () => {
    expect(() => parseModulesOverride('cms,blog')).toThrow(LightConfigError)
    expect(() => parseModulesOverride('cms,blog')).toThrow(
      /LIGHT_CI_MODULES: unknown module "blog", expected a comma-separated list of cms and shop/,
    )
  })
})

describe('applyModulesOverride', () => {
  it('changes only the modules', () => {
    const config = defineLightConfig(validInput())
    expect(applyModulesOverride(config, 'cms')).toEqual({ ...config, modules: { cms: true, shop: false } })
    expect(applyModulesOverride(config, undefined)).toBe(config)
  })

  it('checks the result again: the shop needs its section', () => {
    const input = validInput()
    input.modules.shop = false
    delete input.shop
    const cmsOnly = defineLightConfig(input)
    expect(() => applyModulesOverride(cmsOnly, 'shop')).toThrow(
      /shop: is missing, and it is required when modules\.shop is true/,
    )
  })
})

describe('getLightConfig', () => {
  const previous = process.env.LIGHT_CI_MODULES
  afterEach(() => {
    if (previous === undefined) delete process.env.LIGHT_CI_MODULES
    else process.env.LIGHT_CI_MODULES = previous
  })

  it('returns the root light.config.ts', () => {
    delete process.env.LIGHT_CI_MODULES
    expect(getLightConfig().site.name).toBe('Les Claies')
    expect(getLightConfig().modules).toEqual({ cms: true, shop: true })
  })

  it('applies the CI-only module override', () => {
    process.env.LIGHT_CI_MODULES = 'shop'
    expect(getLightConfig().modules).toEqual({ cms: false, shop: true })
    process.env.LIGHT_CI_MODULES = 'cms'
    expect(getLightConfig().modules).toEqual({ cms: true, shop: false })
  })
})
