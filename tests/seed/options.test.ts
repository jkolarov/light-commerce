import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { SeedError } from '@/seed/errors'
import { databaseFileName, seedOptions } from '@/seed/options'

// `pnpm seed [--force]`: what the command line and the environment give the seed.

describe('seed options', () => {
  const password = 'Tilleul-Combe-Rousse-650'
  const env = { SEED_OWNER_EMAIL: 'owner@example.com', SEED_OWNER_PASSWORD: password }

  /** The message `seedOptions` throws, or '' when it accepts. */
  const refusal = (argv: string[], vars: Record<string, string | undefined>): string => {
    try {
      seedOptions(argv, vars)
      return ''
    } catch (error) {
      expect(error).toBeInstanceOf(SeedError)
      return (error as Error).message
    }
  }

  it('loads demo/ from the working directory into DATABASE_URI, without --force by default', () => {
    expect(seedOptions([], env)).toEqual({
      demoDir: path.resolve('demo'),
      database: 'file:./data/light.db',
      force: false,
      owner: { email: 'owner@example.com', password },
    })
    expect(seedOptions([], { ...env, DATABASE_URI: 'file:/app/data/light.db' }).database).toBe('file:/app/data/light.db')
  })

  it('refuses an unknown option with the usage line', () => {
    expect(refusal(['--fresh'], env)).toMatch(/--fresh.*pnpm seed \[--force\]/s)
  })

  describe('owner account', () => {
    it('needs SEED_OWNER_EMAIL, an email address', () => {
      expect(refusal([], { SEED_OWNER_PASSWORD: password })).toMatch(/SEED_OWNER_EMAIL is not set/)
      expect(refusal([], { ...env, SEED_OWNER_EMAIL: 'not-an-email' })).toMatch(/SEED_OWNER_EMAIL is not an email address/)
    })

    it('lowercases the email, as Payload stores it', () => {
      expect(seedOptions([], { ...env, SEED_OWNER_EMAIL: ' Owner@LesClaies.Example ' }).owner.email).toBe('owner@lesclaies.example')
    })

    it('takes no password when none is set: an existing owner keeps theirs (a new one needs it, see the seed)', () => {
      expect(seedOptions([], { SEED_OWNER_EMAIL: 'owner@example.com' }).owner).toEqual({ email: 'owner@example.com' })
    })

    it('refuses a short password', () => {
      expect(refusal([], { ...env, SEED_OWNER_PASSWORD: 'Short-pw-1' })).toMatch(/SEED_OWNER_PASSWORD is too short.*at least 12/)
    })

    it('refuses a placeholder or common password, whatever its length', () => {
      for (const weak of ['changeme-changeme', 'MyPassword2026!', 'admin-admin-admin', '123456789012', 'aaaaaaaaaaaaaaaa', 'azertyuiop-2026']) {
        expect(refusal([], { ...env, SEED_OWNER_PASSWORD: weak }), weak).toMatch(/SEED_OWNER_PASSWORD looks like a placeholder/)
      }
    })

    it('never puts the password in a message', () => {
      for (const secret of [password, 'Short-pw-1', 'changeme-changeme']) {
        const message = refusal(['--nope'], { SEED_OWNER_EMAIL: 'bad', SEED_OWNER_PASSWORD: secret })
        expect(message).not.toBe('')
        expect(message).not.toContain(secret)
      }
    })
  })

  describe('--force', () => {
    it('needs SEED_CONFIRM_WIPE set to the database file name, and names the database it would wipe', () => {
      const message = refusal(['--force'], env)
      expect(message).toMatch(/--force deletes all content .* from file:\.\/data\/light\.db/)
      expect(message).toMatch(/SEED_CONFIRM_WIPE=light\.db/)
      expect(refusal(['--force'], { ...env, SEED_CONFIRM_WIPE: 'yes' })).toMatch(/SEED_CONFIRM_WIPE=light\.db/)
    })

    it('needs it in production too', () => {
      const vars = { ...env, NODE_ENV: 'production', DATABASE_URI: 'file:/app/data/light.db' }
      expect(refusal(['--force'], vars)).toMatch(/from file:\/app\/data\/light\.db.*SEED_CONFIRM_WIPE=light\.db/s)
    })

    it('goes ahead once confirmed for that database', () => {
      expect(seedOptions(['--force'], { ...env, SEED_CONFIRM_WIPE: 'light.db' }).force).toBe(true)
      const demo = { ...env, DATABASE_URI: 'file:/srv/demo.db' }
      expect(refusal(['--force'], { ...demo, SEED_CONFIRM_WIPE: 'light.db' })).toMatch(/SEED_CONFIRM_WIPE=demo\.db/)
      expect(seedOptions(['--force'], { ...demo, SEED_CONFIRM_WIPE: 'demo.db' }).force).toBe(true)
    })

    it('reads the file name from a DATABASE_URI, without its query string', () => {
      expect(databaseFileName('file:./data/light.db')).toBe('light.db')
      expect(databaseFileName('file:/app/data/light.db?mode=rw')).toBe('light.db')
    })
  })
})
