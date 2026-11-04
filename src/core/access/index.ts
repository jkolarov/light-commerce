import type { Access, PayloadRequest } from 'payload'

// Access helpers shared by every collection. Until S04 adds roles (`users.roles: ('owner' | 'staff')[]`),
// every check that needs a role lets in any logged-in user. The names and types stay when S04 fills them in.

/**
 * A check that reads only the request and answers yes or no, so it fits collection, global and
 * field access alike (`access: { update: isOwner }` on a collection or on the `roles` field).
 */
export type RoleCheck = (args: { req: PayloadRequest }) => boolean

/** Everyone, logged in or not. */
export const anyone: RoleCheck = () => true

/** Users with the `owner` role. Stub: any logged-in user. */
export const isOwner: RoleCheck = ({ req }) => Boolean(req.user)

/** Users with the `staff` or `owner` role. Stub: any logged-in user. */
export const isStaffOrOwner: RoleCheck = ({ req }) => Boolean(req.user)

/** Published documents for everyone, drafts too for staff. Stub: any logged-in user sees drafts. */
export const publishedOrStaff: Access = ({ req }) =>
  req.user ? true : { _status: { equals: 'published' } }
