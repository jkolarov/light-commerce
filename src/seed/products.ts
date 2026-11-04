import type { Locale } from '@/core/i18n/locales'
import type { Product } from '@/payload-types'

import { defined, mediaId, type SeedContext } from './context'
import type { DemoContent } from './demo'
import { markdownLinks } from './links'
import { markdownToLexical, richTextField } from './markdown'
import type { DemoProduct } from './schema'

// Products (shop on): one per entry of products.json, in catalogue order (the shop lists them by
// creation date). Found again by slug, the trash included, so a rerun updates them.
//
// Rules of the products collection (src/modules/shop/collections/) that matter here:
// - every write passes `_status: 'published'`: a product is published in every locale at once,
//   and an update without `_status` could write back stale stock;
// - `inventory` sent on the default-locale write sets the live stock to the demo's number, which
//   is how a rerun (or the nightly reset) restores it;
// - `facts` rows are shared by every locale: the other locales' write sends the rows' ids, or
//   Payload would replace the rows and lose the default locale's text.

type ProductData = Partial<Product> & { deletedAt?: string | null }

/** The localized fields in one locale. In the default locale a missing optional value clears the field. */
function localizedData(ctx: SeedContext, product: DemoProduct, locale: Locale) {
  const description = product.description[locale]
  return defined({
    title: product.name[locale],
    summary: product.summary?.[locale] ?? (locale === ctx.locales.default ? null : undefined),
    description:
      description === undefined
        ? undefined
        : (markdownToLexical({
            field: richTextField(ctx.payload, 'products', ['description']),
            markdown: description,
            linkFields: markdownLinks(ctx, locale, null),
          }) as Product['description']),
  })
}

const factRows = (product: DemoProduct, locale: Locale, ids: (string | null | undefined)[] = []) =>
  product.facts?.map((fact, i) => defined({ id: ids[i] ?? undefined, label: fact.label[locale], value: fact.value[locale] }))

export async function seedProducts(ctx: SeedContext, demo: DemoContent): Promise<void> {
  const { payload, locales } = ctx
  let created = 0
  for (const product of demo.products) {
    const { docs } = await payload.find({
      collection: 'products',
      where: { slug: { equals: product.slug } },
      trash: true,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existing = docs[0]
    const data: ProductData = {
      ...localizedData(ctx, product, locales.default),
      slug: product.slug,
      facts: factRows(product, locales.default) ?? [],
      images: product.images.map((file) => mediaId(ctx, file)),
      priceInEUR: product.price,
      priceInEUREnabled: true,
      inventory: product.stock,
      _status: 'published',
      // Back from the trash, if someone had deleted it.
      ...(existing?.deletedAt ? { deletedAt: null } : {}),
    }
    const write = { locale: locales.default, depth: 0, overrideAccess: true } as const
    const doc = existing
      ? await payload.update({ collection: 'products', id: existing.id, data, trash: true, ...write })
      : await payload.create({ collection: 'products', data: data as Product, ...write })
    if (!existing) created++

    const factIds = (doc.facts ?? []).map((fact) => fact.id)
    for (const locale of locales.others) {
      await payload.update({
        collection: 'products',
        id: doc.id,
        data: { ...localizedData(ctx, product, locale), facts: factRows(product, locale, factIds), _status: 'published' },
        locale,
        depth: 0,
        overrideAccess: true,
      })
    }
    ctx.products.set(product.slug, doc.id)
  }
  ctx.log(`Products: ${ctx.products.size} (${created} created, ${ctx.products.size - created} updated), stock set to the demo's numbers.`)
}
