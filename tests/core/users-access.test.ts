import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'

import { startPayload, type TestPayload } from '../support/payload'

describe('users, roles and access rules', () => {
  let test: TestPayload
  let payload: Payload
  let owner: User
  let staff: User

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
    // The first user, created the way the admin's create-first-user screen does it: anonymous,
    // no roles in the request.
    owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@example.com', password: 'pw-owner-1' },
      overrideAccess: false,
    })
    staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@example.com', password: 'pw-staff-1', roles: ['staff'] },
      overrideAccess: true,
    })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  const as = (user: User) => ({ user, overrideAccess: false as const })

  it('makes the first user an owner', async () => {
    const found = await payload.findByID({ collection: 'users', id: owner.id, overrideAccess: true })
    expect(found.roles).toEqual(['owner'])
  })

  it('defaults later users to staff', async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: 'default@example.com', password: 'pw-default-1' },
      ...as(owner),
    })
    expect(created.roles).toEqual(['staff'])
  })

  it('has no public sign-up once the first user exists', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { email: 'x@example.com', password: 'pw-x-12345', roles: ['owner'] },
        overrideAccess: false,
      }),
    ).rejects.toThrow(/not allowed/i)
    await expect(
      payload.create({
        collection: 'users',
        data: { email: 'y@example.com', password: 'pw-y-12345' },
        ...as(staff),
      }),
    ).rejects.toThrow(/not allowed/i)
  })

  it('lets anonymous visitors read nothing', async () => {
    await expect(payload.find({ collection: 'users', overrideAccess: false })).rejects.toThrow()
  })

  it('lets staff see only themselves, not list users', async () => {
    const res = await payload.find({ collection: 'users', ...as(staff) })
    expect(res.docs.map((d) => d.email)).toEqual(['staff@example.com'])
  })

  it('lets owners list everyone', async () => {
    const res = await payload.find({ collection: 'users', ...as(owner) })
    expect(res.totalDocs).toBeGreaterThanOrEqual(3)
  })

  it('stops staff from changing roles or deleting users', async () => {
    await expect(
      payload.update({ collection: 'users', id: staff.id, data: { roles: ['owner'] }, ...as(staff) }),
    ).rejects.toThrow()
    await expect(payload.delete({ collection: 'users', id: owner.id, ...as(staff) })).rejects.toThrow()
    const still = await payload.findByID({ collection: 'users', id: staff.id, overrideAccess: true })
    expect(still.roles).toEqual(['staff'])
  })

  it('lets owners change roles', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: staff.id,
      data: { roles: ['staff', 'owner'] },
      ...as(owner),
    })
    expect(updated.roles).toEqual(['staff', 'owner'])
  })

  it('keeps at least one role when an update clears them', async () => {
    const u = await payload.create({
      collection: 'users',
      data: { email: 'norole@example.com', password: 'pw-norole-1' },
      ...as(owner),
    })
    const cleared = await payload.update({
      collection: 'users',
      id: u.id,
      data: { roles: [] },
      ...as(owner),
    })
    expect(cleared.roles).toEqual(['staff'])
  })

  describe('the last owner', () => {
    it('cannot be demoted or deleted, but one of two owners can', async () => {
      const second = await payload.create({
        collection: 'users',
        data: { email: 'second@example.com', password: 'pw-second-1', roles: ['owner'] },
        ...as(owner),
      })
      // staff was made owner too in an earlier test: demote it first so two owners remain.
      await payload.update({ collection: 'users', id: staff.id, data: { roles: ['staff'] }, ...as(owner) })

      // Two owners: demoting one works.
      await payload.update({ collection: 'users', id: second.id, data: { roles: ['staff'] }, ...as(owner) })

      // One owner left: demoting, emptying and deleting are all refused.
      for (const roles of [['staff'], []] as ('owner' | 'staff')[][]) {
        await expect(
          payload.update({ collection: 'users', id: owner.id, data: { roles }, ...as(owner) }),
        ).rejects.toThrow(/last owner/i)
      }
      await expect(payload.delete({ collection: 'users', id: owner.id, ...as(owner) })).rejects.toThrow(
        /last owner/i,
      )
      const still = await payload.findByID({ collection: 'users', id: owner.id, overrideAccess: true })
      expect(still.roles).toEqual(['owner'])
    })
  })
})
