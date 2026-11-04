import type { CollectionSlug, Where } from 'payload'

import type { SeedContext } from './context'
import type { DemoContent } from './demo'

// The seed updates the demo's own documents in place, so running it again is safe. Content it
// doesn't know (a page, product or photo the demo doesn't have) means this is someone's site: it
// stops, unless `--force`, which deletes all content first. User accounts are always kept: with no
// user left, the admin's create-first-user screen would open to anyone.

const SHOWN = 5

/** Documents of the collections the seed writes that are not part of the demo, one line per collection. */
export async function findForeignContent(ctx: SeedContext, demo: DemoContent): Promise<string[]> {
  const { payload } = ctx
  const checks: { collection: CollectionSlug; field: string; known: string[]; trash?: boolean }[] = [
    { collection: 'media', field: 'filename', known: demo.media.map((entry) => entry.file) },
    ...(ctx.modules.cms ? [{ collection: 'pages' as const, field: 'slug', known: demo.pages.map((page) => page.slug.fr) }] : []),
    ...(ctx.modules.shop
      ? [{ collection: 'products' as const, field: 'slug', known: demo.products.map((product) => product.slug), trash: true }]
      : []),
  ]
  const lines: string[] = []
  for (const { collection, field, known, trash } of checks) {
    const where: Where = { or: [{ [field]: { not_in: known } }, { [field]: { exists: false } }] }
    const { docs, totalDocs } = await payload.find({
      collection,
      where,
      locale: 'fr',
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
 * preferences, migrations, locks). Media goes last, with its files. Returns the counts.
 */
export async function wipeContent(ctx: SeedContext): Promise<Record<string, number>> {
  const { payload } = ctx
  const slugs = payload.config.collections
    .map((collection) => collection.slug)
    .filter((slug) => slug !== 'users' && !slug.startsWith('payload-'))
    .sort((a, b) => Number(a === 'media') - Number(b === 'media'))
  const deleted: Record<string, number> = {}
  for (const slug of slugs) {
    const collection = slug as CollectionSlug
    const trash = Boolean(payload.collections[collection]?.config.trash)
    const result = await payload.delete({
      collection,
      where: { id: { exists: true } },
      depth: 0,
      overrideAccess: true,
      ...(trash ? { trash: true } : {}),
    })
    if (result.errors.length) {
      throw new Error(`--force: could not delete ${result.errors.length} ${slug}: ${result.errors.map((e) => e.message).join('; ')}`)
    }
    if (result.docs.length) deleted[slug] = result.docs.length
  }
  const what = Object.entries(deleted).map(([slug, n]) => `${n} ${slug}`)
  ctx.log(`--force: deleted ${what.length ? what.join(', ') : 'nothing (the database had no content)'}. User accounts are kept.`)
  return deleted
}
