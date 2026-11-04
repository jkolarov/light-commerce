import type { Access, FieldAccess, PayloadRequest } from 'payload'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { anyone, isOwner, isStaffOrOwner, publishedOrStaff } from '@/core/access'

const as = (roles: string[]) => ({ user: { id: 1, collection: 'users', roles } }) as unknown as PayloadRequest
const asOwner = as(['owner'])
const asStaff = as(['staff'])
const noRoles = as([])
const asGuest = { user: null } as unknown as PayloadRequest

describe('access helpers', () => {
  it('role checks fit collection, global and field access alike', () => {
    expectTypeOf(anyone).toExtend<Access>()
    expectTypeOf(anyone).toExtend<FieldAccess>()
    expectTypeOf(isOwner).toExtend<Access>()
    expectTypeOf(isOwner).toExtend<FieldAccess>()
    expectTypeOf(isStaffOrOwner).toExtend<Access>()
    expectTypeOf(isStaffOrOwner).toExtend<FieldAccess>()
    expectTypeOf(publishedOrStaff).toExtend<Access>()
  })

  it('checks roles', () => {
    expect(anyone({ req: asGuest })).toBe(true)
    expect(isOwner({ req: asOwner })).toBe(true)
    expect(isOwner({ req: asStaff })).toBe(false)
    expect(isOwner({ req: noRoles })).toBe(false)
    expect(isOwner({ req: asGuest })).toBe(false)
    expect(isStaffOrOwner({ req: asOwner })).toBe(true)
    expect(isStaffOrOwner({ req: asStaff })).toBe(true)
    expect(isStaffOrOwner({ req: noRoles })).toBe(false)
    expect(isStaffOrOwner({ req: asGuest })).toBe(false)
  })

  it('show guests only published documents, staff and owners everything', () => {
    expect(publishedOrStaff({ req: asOwner, slug: 'pages' })).toBe(true)
    expect(publishedOrStaff({ req: asStaff, slug: 'pages' })).toBe(true)
    expect(publishedOrStaff({ req: asGuest, slug: 'pages' })).toEqual({ _status: { equals: 'published' } })
    expect(publishedOrStaff({ req: noRoles, slug: 'pages' })).toEqual({ _status: { equals: 'published' } })
  })
})
