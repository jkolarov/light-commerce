import type { Access, PayloadRequest } from 'payload'

// Access helpers shared by every collection. Roles live on `users.roles: ('owner' | 'staff')[]`.

export type Role = 'owner' | 'staff'

/**
 * A check that reads only the request and answers yes or no, so it fits collection, global and
 * field access alike (`access: { update: isOwner }` on a collection or on the `roles` field).
 */
export type RoleCheck = (args: { req: PayloadRequest }) => boolean

function hasRole(req: PayloadRequest, ...allowed: Role[]): boolean {
  const user = req.user as { collection?: string; roles?: unknown } | null
  if (!user || user.collection !== 'users' || !Array.isArray(user.roles)) return false
  return user.roles.some((role) => allowed.includes(role as Role))
}

/** Everyone, logged in or not. */
export const anyone: RoleCheck = () => true

/** Users with the `owner` role. */
export const isOwner: RoleCheck = ({ req }) => hasRole(req, 'owner')

/** Users with the `staff` or `owner` role. */
export const isStaffOrOwner: RoleCheck = ({ req }) => hasRole(req, 'owner', 'staff')

/** Published documents for everyone, drafts too for staff and owners. */
export const publishedOrStaff: Access = ({ req }) =>
  isStaffOrOwner({ req }) ? true : { _status: { equals: 'published' } }
