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
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'users',
        data: { email: 'y@example.com', password: 'pw-y-12345' },
        ...as(staff),
      }),
    ).rejects.toThrow()
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
})
