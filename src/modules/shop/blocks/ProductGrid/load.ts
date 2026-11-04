import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { ProductGridBlock } from '@/payload-types'

import type { ProductCardProduct } from '../../components/ProductCard'

type ProductWithId = ProductCardProduct & { id: number }

const idOf = (item: number | { id: number }) => (typeof item === 'object' ? item.id : item)

/**
 * The published products a grid block shows, as an anonymous visitor (`overrideAccess: false`,
 * `draft: false`): drafts, never-published and trashed products are left out, whatever the block
 * references. Picked products keep the editor's order; "latest" is the newest first.
 */
export async function findGridProducts(
  payload: Payload,
  locale: Locale,
  block: Pick<ProductGridBlock, 'mode' | 'count' | 'products'>,
): Promise<ProductWithId[]> {
  if (block.mode === 'selected') {
    const ids = (block.products ?? []).map(idOf)
    if (ids.length === 0) return []
    const { docs } = await payload.find({
      collection: 'products',
      where: { id: { in: ids } },
      locale,
      depth: 1,
      pagination: false,
      draft: false,
      overrideAccess: false,
    })
    const byId = new Map(docs.map((doc) => [doc.id, doc]))
    return ids.flatMap((id) => byId.get(id) ?? [])
  }
  const { docs } = await payload.find({
    collection: 'products',
    locale,
    depth: 1,
    sort: '-createdAt',
    limit: Math.min(Math.max(block.count ?? 4, 1), 12),
    pagination: false,
    draft: false,
    overrideAccess: false,
  })
  return docs
}
