import type { Payload } from 'payload'

import { createContext } from './context'
import { readDemo } from './demo'
import { SeedError } from './errors'
import { seedMedia } from './media'
import { seedMenus } from './menus'
import type { SeedOwner } from './options'
import { ensureOwner } from './owner'
import { ensurePages, seedPages } from './pages'
import { seedProducts } from './products'
import { findForeignContent, wipeContent } from './wipe'

// The demo seed: loads demo/ (shape in demo/README.md) into the site with the Local API, always
// with `overrideAccess: true` (Payload 4's Local API applies access rules by default).
//
// Order: check demo/ and the database, owner, then (with `force`) the wipe, photos, pages (ids
// first), products, pages in full, menus. Each module's content is loaded only when the module is
// on. Running it again updates the same documents.
//
// `force` is taken as given here: the command line asks for its confirmation (options.ts).

export type SeedSummary = {
  owner: 'created' | 'kept' | 'promoted'
  media: number
  pages: number
  products: number
  /** Demo content left out because its module is off. */
  skipped: string[]
  /** With `force`: what was deleted first, per collection. */
  wiped?: Record<string, number>
}

export async function seedDemo(
  payload: Payload,
  opts: {
    demoDir: string
    owner: SeedOwner
    force?: boolean
    /** The database, as messages name it (DATABASE_URI without its query string). */
    target?: string
    log?: (line: string) => void
  },
): Promise<SeedSummary> {
  const ctx = createContext(payload, opts.log ?? ((line) => payload.logger.info(line)))
  const { cms, shop } = ctx.modules
  // Everything is checked before the first write.
  const demo = readDemo(opts.demoDir)
  ctx.log(`Seeding the demo from ${demo.dir} (modules on: ${[cms && 'cms', shop && 'shop'].filter(Boolean).join(', ') || 'none'}).`)
  if (!cms) ctx.skipped.push('pages and menus (the CMS is off)')
  if (!shop) ctx.skipped.push('products (the shop is off)')

  if (!opts.force) {
    const foreign = await findForeignContent(ctx, demo)
    if (foreign.length) {
      throw new SeedError(
        'The database has pages, products or photos that are not part of the demo, so the seed leaves it alone. ' +
          'To delete all content (user accounts are kept) and load the demo, run: pnpm seed --force',
        foreign,
      )
    }
  }
  // Before the wipe: if the wipe fails halfway, the site still has its owner.
  const owner = await ensureOwner(ctx, opts.owner)
  const wiped = opts.force ? await wipeContent(ctx, opts.target ?? 'the database') : undefined

  await seedMedia(ctx, demo)
  if (cms) await ensurePages(ctx, demo)
  if (shop) await seedProducts(ctx, demo)
  if (cms) {
    await seedPages(ctx, demo)
    await seedMenus(ctx, demo)
  }
  for (const line of ctx.skipped) ctx.log(`Skipped: ${line}.`)
  ctx.log('The demo is loaded.')
  return {
    owner,
    media: ctx.media.size,
    pages: ctx.pages.size,
    products: ctx.products.size,
    skipped: ctx.skipped,
    ...(wiped ? { wiped } : {}),
  }
}
