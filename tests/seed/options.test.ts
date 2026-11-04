import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { SeedError } from '@/seed/errors'
import { seedOptions } from '@/seed/options'

// `pnpm seed [--force]`: what the command line and the environment give the seed.

describe('seed options', () => {
  const env = { SEED_OWNER_EMAIL: 'owner@example.com', SEED_OWNER_PASSWORD: 'a-secret-password' }

  it('loads demo/ from the working directory, without --force by default', () => {
    expect(seedOptions([], env)).toEqual({
      demoDir: path.resolve('demo'),
      force: false,
      owner: { email: 'owner@example.com', password: 'a-secret-password' },
    })
  })

  it('takes --force', () => {
    expect(seedOptions(['--force'], env).force).toBe(true)
  })

  it('refuses an unknown option with the usage line', () => {
    expect(() => seedOptions(['--fresh'], env)).toThrow(SeedError)
    expect(() => seedOptions(['--fresh'], env)).toThrow(/--fresh.*pnpm seed \[--force\]/s)
  })

  it('needs the owner account from SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD', () => {
    expect(() => seedOptions([], { SEED_OWNER_PASSWORD: 'x' })).toThrow(/SEED_OWNER_EMAIL/)
    expect(() => seedOptions([], { SEED_OWNER_EMAIL: 'owner@example.com' })).toThrow(/SEED_OWNER_PASSWORD/)
    expect(() => seedOptions([], { ...env, SEED_OWNER_EMAIL: 'not-an-email' })).toThrow(/SEED_OWNER_EMAIL/)
  })

  it('never puts the password in a message', () => {
    let message = ''
    try {
      seedOptions(['--nope'], { ...env, SEED_OWNER_EMAIL: 'bad' })
    } catch (error) {
      message = String(error)
    }
    expect(message).not.toBe('')
    expect(message).not.toContain(env.SEED_OWNER_PASSWORD)
  })
})
