import path from 'node:path'

import { defined, type SeedContext } from './context'
import type { DemoContent } from './demo'

/** The photos the content that will be loaded uses: pages only with the CMS on, products only with the shop on. */
export function photosInUse(demo: DemoContent, modules: SeedContext['modules']): Set<string> {
  const files = new Set<string>()
  if (modules.cms) {
    for (const page of demo.pages) {
      if (page.seo.image) files.add(page.seo.image)
      for (const block of page.layout) if ('image' in block) files.add(block.image)
    }
  }
  if (modules.shop) for (const product of demo.products) product.images.forEach((file) => files.add(file))
  return files
}

/**
 * Uploads each photo once (`images/<file>` → `media`), with its alt text in every locale. A photo
 * already there under the same file name is kept, and only its alt text is set again. Variants are
 * made on upload (core media collection); files go to MEDIA_DIR.
 */
export async function seedMedia(ctx: SeedContext, demo: DemoContent): Promise<void> {
  const { payload, locales } = ctx
  const files = photosInUse(demo, ctx.modules)
  let created = 0
  for (const entry of demo.media) {
    if (!files.has(entry.file)) continue
    const { docs } = await payload.find({
      collection: 'media',
      where: { filename: { equals: entry.file } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const alt = entry.alt[locales.default] ?? entry.alt.fr
    let id = docs[0]?.id
    if (id === undefined) {
      const doc = await payload.create({
        collection: 'media',
        data: { alt },
        filePath: path.join(demo.dir, 'images', entry.file),
        // A file left on disk by an earlier database would make Payload rename this one
        // (garrigue-1.jpg), and the next run would not find it by name.
        overwriteExistingFiles: true,
        locale: locales.default,
        depth: 0,
        overrideAccess: true,
      })
      id = doc.id
      created++
    } else {
      await payload.update({ collection: 'media', id, data: { alt }, locale: locales.default, depth: 0, overrideAccess: true })
    }
    for (const locale of locales.others) {
      const data = defined({ alt: entry.alt[locale] })
      if (Object.keys(data).length) await payload.update({ collection: 'media', id, data, locale, depth: 0, overrideAccess: true })
    }
    ctx.media.set(entry.file, id)
  }
  ctx.log(`Media: ${ctx.media.size} photos (${created} uploaded, ${ctx.media.size - created} already there).`)
}
