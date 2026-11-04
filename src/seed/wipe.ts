import type { CollectionSlug, Where } from 'payload'

import type { SeedContext } from './context'
import type { DemoContent } from './demo'

// The seed updates the demo's own documents in place, so running it again is safe. Content it
// doesn't know (a page, product or photo the demo doesn't have) means this is someone's site: it
// stops, unless `--force`, which deletes all content first. User accounts are always kept: with no
// user left, the admin's create-first-user screen would open to anyone.
//
// The check looks at the collections the seed writes, media, pages and products, and nothing else:
// orders, carts and the like from a live demo never stop a rerun (and the seed never touches them).
// `--force` itself is confirmed on the command line (SEED_CONFIRM_WIPE, see options.ts).

const SHOWN = 5

/** `locale`: the demo names pages by their French slug, so `where` is read in French. */
type ForeignCheck = { collection: CollectionSlug; field: string; where: Where; locale: 'fr'; trash?: boolean }

/** For each collection the seed writes: how to find its documents the demo doesn't have. */
export function foreignChecks(ctx: SeedContext, demo: DemoContent): ForeignCheck[] {
  const checks: { collection: CollectionSlug; field: string; known: string[]; trash?: boolean }[] = [
    { collection: 'media', field: 'filename', known: demo.media.map((entry) => entry.file) },
    ...(ctx.modules.cms ? [{ collection: 'pages' as const, field: 'slug', known: demo.pages.map((page) => page.slug.fr) }] : []),
    ...(ctx.modules.shop
      ? [{ collection: 'products' as const, field: 'slug', known: demo.products.map((product) => product.slug), trash: true }]
      : []),
  ]
  return checks.map(({ collection, field, known, trash }) => ({
    collection,
    field,
    where: { or: [{ [field]: { not_in: known } }, { [field]: { exists: false } }] },
    locale: 'fr' as const,
    ...(trash ? { trash } : {}),
  }))
}

/** Documents of the collections the seed writes that are not part of the demo, one line per collection. */
export async function findForeignContent(ctx: SeedContext, demo: DemoContent): Promise<string[]> {
  const { payload } = ctx
  const lines: string[] = []
  for (const { collection, field, where, locale, trash } of foreignChecks(ctx, demo)) {
    const { docs, totalDocs } = await payload.find({
      collection,
      where,
      locale,
      limit: SHOWN,
      depth: 0,
      overrideAccess: true,
      ...(trash ? { trash: true } : {}),
    })
    if (!totalDocs) continue
    const names = docs.map((doc) => String((doc as unknown as Record<string, unknown>)[field] ?? `id ${doc.id}`))
    const more = totalDocs > SHOWN ? ` and ${totalDocs - SHOWN} more` : ''
    lines.push(`${collection}: ${names.join(', ')}${more}`)
  }
  return lines
}

/**
 * Deletes every document of every collection except users and Payload's own (`payload-*`:
 * preferences, migrations, locks). Media goes last, with its files. First says what it is about to
 * delete and from which database (`target`). Returns the counts.
 */
export async function wipeContent(ctx: SeedContext, target: string): Promise<Record<string, number>> {
  const { payload } = ctx
  const collections = payload.config.collections
    .map((collection) => collection.slug as CollectionSlug)
    .filter((slug) => slug !== 'users' && !slug.startsWith('payload-'))
    .sort((a, b) => Number(a === 'media') - Number(b === 'media'))
    .map((slug) => ({ slug, trash: Boolean(payload.collections[slug]?.config.trash) }))
  const list = (counts: Record<string, number>) => Object.entries(counts).map(([slug, n]) => `${n} ${slug}`).join(', ')

  const found: Record<string, number> = {}
  for (const { slug, trash } of collections) {
    const { totalDocs } = await payload.count({ collection: slug, overrideAccess: true, ...(trash ? { trash: true } : {}) })
    if (totalDocs) found[slug] = totalDocs
  }
  if (!Object.keys(found).length) {
    ctx.log(`--force: ${target} has no content to delete. User accounts are kept.`)
    return {}
  }
  ctx.log(`--force: about to delete from ${target}: ${list(found)}. User accounts are kept.`)

  const deleted: Record<string, number> = {}
  for (const { slug, trash } of collections) {
    if (!found[slug]) continue
    const result = await payload.delete({
      collection: slug,
      where: { id: { exists: true } },
      depth: 0,
      overrideAccess: true,
      ...(trash ? { trash: true } : {}),
    })
    if (result.docs.length) deleted[slug] = result.docs.length
    if (result.errors.length) {
      throw new Error(
        `--force: could not delete ${result.errors.length} ${slug} (deleted so far: ${list(deleted) || 'nothing'}): ` +
          result.errors.map((e) => e.message).join('; '),
      )
    }
  }
  ctx.log(`--force: deleted ${list(deleted)}.`)
  return deleted
}
