import type { CollectionBeforeOperationHook, CollectionSlug, PayloadRequest } from 'payload'

// Pages and products publish in every language at once. Payload 4 keeps a publish status per
// language (`localizeStatus`), and its Publish button only does the language on screen, so a page
// published in French would be a 404 in English. With this hook a publish covers every language,
// and a missing translation falls back to the default language's text.
//
// Unpublishing is left as it is: "Unpublish" (`unpublishAllLocales`) takes the document down
// everywhere, "Unpublish in English" in that language only, until the next publish, which
// publishes every language again.

type WriteArgs = {
  data?: Record<string, unknown>
  draft?: boolean
  id?: number | string
  publishAllLocales?: boolean
  unpublishAllLocales?: boolean
}

/** Whether the live document is published, in any language. */
async function isPublished(req: PayloadRequest, collection: CollectionSlug, id: number | string): Promise<boolean> {
  const doc = await req.payload.db.findOne<{ id: number | string; _status?: unknown }>({
    collection,
    where: { id: { equals: id } },
    locale: 'all',
    select: { _status: true },
    req,
  })
  const status = doc?._status
  if (status && typeof status === 'object') return Object.values(status).includes('published')
  return status === 'published'
}

/**
 * `beforeOperation` for a collection with localized drafts: a create or update that publishes
 * publishes every language. An update that sends no `_status` but isn't a draft save republishes
 * a published document, so it counts as a publish too. Draft saves, unpublishing and moving to the
 * trash are left as they are. (On a collection with a trash, the admin's form always sends
 * `deletedAt`, empty unless the document is being trashed.)
 */
export const publishInEveryLocale: CollectionBeforeOperationHook = async ({ args, collection, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return args
  const write = args as WriteArgs
  const data = write.data
  if (!data || write.draft || write.unpublishAllLocales || data.deletedAt != null) return args
  const republishes = async () =>
    operation === 'update' &&
    write.id !== undefined &&
    !('deletedAt' in data) &&
    (await isPublished(req, collection.slug, write.id))
  const publishes = data._status === 'published' || (data._status === undefined && (await republishes()))
  if (!publishes) return args
  data._status = 'published'
  write.publishAllLocales = true
  return args
}
