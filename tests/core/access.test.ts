import type { Access, FieldAccess, PayloadRequest } from 'payload'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { anyone, isOwner, isStaffOrOwner, publishedOrStaff } from '@/core/access'

const asUser = { user: { id: 1, collection: 'users' } } as unknown as PayloadRequest
const asGuest = { user: null } as unknown as PayloadRequest

describe('access helpers (stubs until S04)', () => {
  it('role checks fit collection, global and field access alike', () => {
    expectTypeOf(anyone).toExtend<Access>()
    expectTypeOf(anyone).toExtend<FieldAccess>()
    expectTypeOf(isOwner).toExtend<Access>()
    expectTypeOf(isOwner).toExtend<FieldAccess>()
    expectTypeOf(isStaffOrOwner).toExtend<Access>()
    expectTypeOf(isStaffOrOwner).toExtend<FieldAccess>()
    expectTypeOf(publishedOrStaff).toExtend<Access>()
  })

  it('let in any logged-in user for now', () => {
    expect(anyone({ req: asGuest })).toBe(true)
    expect(isOwner({ req: asUser })).toBe(true)
    expect(isOwner({ req: asGuest })).toBe(false)
    expect(isStaffOrOwner({ req: asUser })).toBe(true)
    expect(isStaffOrOwner({ req: asGuest })).toBe(false)
  })

  it('show guests only published documents', () => {
    expect(publishedOrStaff({ req: asUser, slug: 'pages' })).toBe(true)
    expect(publishedOrStaff({ req: asGuest, slug: 'pages' })).toEqual({ _status: { equals: 'published' } })
  })
})
