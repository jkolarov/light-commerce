import { afterEach, describe, expect, it, vi } from 'vitest'

import { prepareDatabaseOrStop, preparesDatabaseAtStartup } from '@/core/dbStartup'

// src/core/dbStartup.ts: a production server applies pending migrations as it starts, and stops
// when that fails, so a broken migration is a restart loop, not a healthy server answering 500s.

describe('preparing the database at startup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('happens on a production server only, never during `next build`', () => {
    expect(preparesDatabaseAtStartup({ NODE_ENV: 'production' })).toBe(true)
    expect(preparesDatabaseAtStartup({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-server' })).toBe(true)
    expect(preparesDatabaseAtStartup({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })).toBe(false)
    expect(preparesDatabaseAtStartup({ NODE_ENV: 'development' })).toBe(false)
    expect(preparesDatabaseAtStartup({ NODE_ENV: 'test' })).toBe(false)
    expect(preparesDatabaseAtStartup({})).toBe(false)
  })

  it('lets the server start once the database is ready', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const init = vi.fn(async () => {})
    await prepareDatabaseOrStop(init)
    expect(init).toHaveBeenCalledOnce()
    expect(exit).not.toHaveBeenCalled()
  })

  it('stops the server, saying why, when a migration fails', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await prepareDatabaseOrStop(async () => {
      throw new Error('no such table: orders')
    })
    expect(exit).toHaveBeenCalledWith(1)
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('a migration in src/migrations failed'), expect.objectContaining({ message: 'no such table: orders' }))
  })
})
