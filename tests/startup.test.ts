import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// src/instrumentation.ts runs once when the server starts. Each test loads it afresh
// (`vi.resetModules`), so a mock or an environment variable set in the test applies.
const register = async () => (await import('@/instrumentation')).register()

// A production start prepares the database (src/core/dbStartup.ts): watched here, never run, so no
// test boots Payload against a real database file.
const database = vi.hoisted(() => ({ prepared: 0 }))
vi.mock('@/core/dbStartup', async (original) => ({
  ...(await original<typeof import('@/core/dbStartup')>()),
  prepareDatabaseOrStop: async () => void database.prepared++,
}))

const variables = ['NEXT_RUNTIME', 'NODE_ENV', 'CI', 'LIGHT_CI_MODULES'] as const

// With the shop on, a server needs its Stripe keys (src/modules/shop/payments/stripe/startup.ts).
// Placeholders: these tests never call Stripe.
const stripeKeys = { STRIPE_SECRET_KEY: 'test-placeholder-secret', STRIPE_WEBHOOKS_SIGNING_SECRET: 'test-placeholder-webhook' }
const publishableKey = { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'test-placeholder-publishable' }

describe('server startup', () => {
  const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]))
  let exit: ReturnType<typeof vi.spyOn>
  let logError: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    database.prepared = 0
    process.env.NEXT_RUNTIME = 'nodejs'
    delete process.env.LIGHT_CI_MODULES
    exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const [key, value] of Object.entries({ ...stripeKeys, ...publishableKey })) vi.stubEnv(key, value)
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    vi.doUnmock('@/config/define')
    vi.doUnmock('@/config/startup')
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('starts with a valid light.config.ts', async () => {
    await register()
    expect(exit).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('stops the server, listing the problems, when light.config.ts is broken', async () => {
    // The root file calls defineLightConfig when it is imported; make that call fail as it would
    // for a broken file.
    vi.doMock('@/config/define', async () => {
      const { LightConfigError } = await import('@/config/errors')
      return {
        defineLightConfig: () => {
          throw new LightConfigError(['theme.colors.primary: expected a hex colour'])
        },
      }
    })
    await register()
    expect(logError).toHaveBeenCalledWith(
      expect.stringMatching(/light\.config\.ts is not valid \(1 problem\):\n {2}- theme\.colors\.primary/),
    )
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('stops the server when LIGHT_CI_MODULES is broken', async () => {
    process.env.LIGHT_CI_MODULES = 'blog'
    await register()
    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/LIGHT_CI_MODULES: unknown module "blog"/))
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('stops a production server without SMTP_HOST, and starts with it', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SMTP_HOST', '')
    await register()
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('SMTP_HOST is not set'))
    expect(exit).toHaveBeenCalledWith(1)
    exit.mockClear()
    vi.stubEnv('SMTP_HOST', 'mailpit')
    await register()
    expect(exit).not.toHaveBeenCalled()
  })

  it('prepares the database (pending migrations) as a production server starts, after the other checks', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SMTP_HOST', 'mailpit')
    await register()
    expect(database.prepared).toBe(1)
    expect(exit).not.toHaveBeenCalled()
  })

  it('leaves the database alone during `next build` and in development', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SMTP_HOST', 'mailpit')
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    await register()
    vi.stubEnv('NEXT_PHASE', '')
    vi.stubEnv('NODE_ENV', 'development')
    await register()
    expect(database.prepared).toBe(0)
  })

  it.each(Object.keys(stripeKeys))('stops the server when the shop is on and %s is missing', async (key) => {
    // Without them the plugin's Stripe webhook answers 200 and drops every event: orders would be lost.
    process.env.LIGHT_CI_MODULES = 'shop'
    vi.stubEnv(key, ' ')
    await register()
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(`${key} is not set`))
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('warns, without stopping, when the card form has no publishable key', async () => {
    process.env.LIGHT_CI_MODULES = 'shop'
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '')
    await register()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set'))
    expect(exit).not.toHaveBeenCalled()
  })

  it('needs no Stripe keys when the shop is off', async () => {
    process.env.LIGHT_CI_MODULES = 'cms'
    for (const key of Object.keys(stripeKeys)) vi.stubEnv(key, '')
    await register()
    expect(exit).not.toHaveBeenCalled()
  })

  it('refuses LIGHT_CI_MODULES on a production server', async () => {
    // It would switch a module off without a word: on a shop, payments would create no orders.
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.CI
    process.env.LIGHT_CI_MODULES = 'cms'
    await register()
    expect(logError).toHaveBeenCalledWith(
      expect.stringMatching(/LIGHT_CI_MODULES: set to "cms" on a production server, but it is for CI and tests only/),
    )
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('accepts LIGHT_CI_MODULES on a production build in CI, with a warning', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SMTP_HOST', 'mailpit') // a production server needs SMTP (src/core/email)
    process.env.CI = 'true'
    process.env.LIGHT_CI_MODULES = 'cms'
    await register()
    expect(exit).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/modules come from LIGHT_CI_MODULES=cms/))
  })

  it('warns when LIGHT_CI_MODULES switches modules in development', async () => {
    process.env.LIGHT_CI_MODULES = 'shop'
    await register()
    expect(exit).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/modules come from LIGHT_CI_MODULES=shop \(CI and tests only\), not from light\.config\.ts/),
    )
  })

  it('lets errors other than a broken config through', async () => {
    vi.doMock('@/config/define', () => ({
      defineLightConfig: () => {
        throw new TypeError('something else broke')
      },
    }))
    await expect(register()).rejects.toThrow(TypeError)
    expect(exit).not.toHaveBeenCalled()
  })

  it('does nothing in the edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    const stopIfConfigIsBroken = vi.fn()
    vi.doMock('@/config/startup', () => ({ stopIfConfigIsBroken }))
    await register()
    expect(stopIfConfigIsBroken).not.toHaveBeenCalled()

    process.env.NEXT_RUNTIME = 'nodejs'
    await register()
    expect(stopIfConfigIsBroken).toHaveBeenCalledOnce()
  })
})
