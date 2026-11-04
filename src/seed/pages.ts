import type { Locale } from '@/core/i18n/locales'
import type { Page } from '@/payload-types'

import { pageLayout } from './blocks'
import { defined, mediaId, type SeedContext } from './context'
import type { DemoContent } from './demo'
import type { DemoPage } from './schema'

// Pages (CMS on), in two passes: links between pages need every page's id first.
//
// 1. `ensurePages`: finds each page by its French slug, or creates it as a draft with its title
//    and slug only. Runs before the products, so product descriptions can link to pages too.
// 2. `seedPages`: writes each page in full, published in every locale (Payload 4 keeps a publish
//    status per locale; the demo is public in both, and a missing English text falls back to the
//    French one). The other locales' write sends the layout rows' ids, or Payload would replace
//    the rows and lose the default locale's text.

/** Pass 1: the id of every demo page, created as an empty draft when it doesn't exist yet. */
export async function ensurePages(ctx: SeedContext, demo: DemoContent): Promise<void> {
  const { payload, locales } = ctx
  for (const page of demo.pages) {
    const { docs } = await payload.find({
      collection: 'pages',
      where: { slug: { equals: page.slug.fr } },
      locale: 'fr',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const id =
      docs[0]?.id ??
      (
        await payload.create({
          collection: 'pages',
          data: { title: page.title[locales.default] ?? page.title.fr, slug: page.slug[locales.default] ?? page.slug.fr, _status: 'draft' },
          draft: true,
          locale: locales.default,
          depth: 0,
          overrideAccess: true,
        })
      ).id
    ctx.pages.set(page.slug.fr, { id, slug: page.slug })
  }
}

function pageData(ctx: SeedContext, page: DemoPage, locale: Locale) {
  return defined({
    title: page.title[locale],
    slug: page.slug[locale],
    // The SEO plugin's fields (`meta`); the share image is localized too.
    meta: defined({
      title: page.seo.title[locale],
      description: page.seo.description[locale],
      image: page.seo.image ? mediaId(ctx, page.seo.image) : undefined,
    }),
  })
}

/** Pass 2: every page in full, published in every locale. */
export async function seedPages(ctx: SeedContext, demo: DemoContent): Promise<void> {
  const { payload, locales } = ctx
  for (const page of demo.pages) {
    const { id } = ctx.pages.get(page.slug.fr)!
    const layout = pageLayout(ctx, page, locales.default)
    ctx.skipped.push(...layout.skipped.map((what) => `pages/${page.file}.json: ${what}`))
    const doc = await payload.update({
      collection: 'pages',
      id,
      data: { ...pageData(ctx, page, locales.default), layout: layout.rows as Page['layout'], _status: 'published' },
      publishAllLocales: true,
      locale: locales.default,
      depth: 0,
      overrideAccess: true,
    })
    const ids = (doc.layout ?? []).map((row) => row.id)
    for (const locale of locales.others) {
      await payload.update({
        collection: 'pages',
        id,
        data: { ...pageData(ctx, page, locale), layout: pageLayout(ctx, page, locale, ids).rows as Page['layout'], _status: 'published' },
        locale,
        depth: 0,
        overrideAccess: true,
      })
    }
  }
  ctx.log(`Pages: ${demo.pages.length}, published in ${[locales.default, ...locales.others].join(' and ')}.`)
}
