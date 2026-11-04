import type { CollectionBeforeOperationHook, PayloadRequest } from 'payload'

// A product is published in every language at once: it has one slug and is sold in every
// language, and a missing translation falls back to the default language. (Payload 4 keeps a
// publish status per language, and its Publish button only does the language on screen.)
//
// It also keeps sales safe: Payload's one-language publish builds the live row from a read of the
// whole document taken during the save, so it would write back the stock as it was at that
// moment, over a sale landing in between (liveStock.ts). The all-languages path writes only what
// the save gives it, and the save never gives it the stock.

type WriteArgs = {
  data?: Record<string, unknown>
  draft?: boolean
  id?: number | string
  publishAllLocales?: boolean
  unpublishAllLocales?: boolean
}

/** Whether the live product is published, in any language. */
async function isPublished(req: PayloadRequest, id: number | string): Promise<boolean> {
  const doc = await req.payload.db.findOne<{ id: number | string; _status?: unknown }>({
    collection: 'products',
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
 * `beforeOperation` on products: a create or update that publishes publishes every language.
 * An update that sends no `_status` but isn't a draft save republishes a published product, so
 * it counts as a publish too. Draft saves, unpublishing and moving to the trash are left as they
 * are. (The admin's form always sends `deletedAt`, empty unless the product is being trashed.)
 */
export const publishInEveryLocale: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return args
  const write = args as WriteArgs
  const data = write.data
  if (!data || write.draft || write.unpublishAllLocales || data.deletedAt != null) return args
  const republishes = async () =>
    operation === 'update' && write.id !== undefined && !('deletedAt' in data) && (await isPublished(req, write.id))
  const publishes = data._status === 'published' || (data._status === undefined && (await republishes()))
  if (!publishes) return args
  data._status = 'published'
  write.publishAllLocales = true
  return args
}
