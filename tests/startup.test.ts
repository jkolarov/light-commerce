import { afterEach, describe, expect, it, vi } from 'vitest'

import { register } from '@/instrumentation'

// src/instrumentation.ts runs when the server starts. light.config.ts itself is valid, so a bad
// CI module override stands in for a broken config here (tests/config covers the file itself).
describe('server startup', () => {
  const previous = { runtime: process.env.NEXT_RUNTIME, modules: process.env.LIGHT_CI_MODULES }
  afterEach(() => {
    for (const [key, value] of [
      ['NEXT_RUNTIME', previous.runtime],
      ['LIGHT_CI_MODULES', previous.modules],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    vi.restoreAllMocks()
  })

  it('loads the config', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    delete process.env.LIGHT_CI_MODULES
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await register()
    expect(exit).not.toHaveBeenCalled()
  })

  it('stops the server with the list of problems when the config is broken', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    process.env.LIGHT_CI_MODULES = 'blog'
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await register()
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/LIGHT_CI_MODULES: unknown module "blog"/))
    expect(exit).toHaveBeenCalledWith(1)
  })
})
