import type { CollectionBeforeOperationHook } from 'payload'

import { isStaffOrOwner } from './index'

// Every collection with drafts uses these two (see the plan, "Roles and access").
//
// Why: with localized fields Payload keeps a publish status per language, and the `_status equals
// published` filter of `publishedOrStaff` only looks at the requested language. So an anonymous
// `?draft=true` read, or a read of the versions table, could return draft text. Drafts and
// versions are for staff and owners only.

/** `access.readVersions` for a collection with drafts. */
export const readVersions = isStaffOrOwner

/**
 * `hooks.beforeOperation` for a collection with drafts: anonymous and customer reads never ask
 * for drafts, whatever `draft` they pass. Server code that passes `overrideAccess: true` is left alone.
 */
export const forcePublishedForPublic: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'read' && operation !== 'readDistinct' && operation !== 'count') return args
  const readArgs = args as { draft?: boolean; overrideAccess?: boolean }
  if (readArgs.overrideAccess || isStaffOrOwner({ req })) return args
  return { ...args, draft: false } as typeof args
}
