import type { Locale } from '@/core/i18n/locales'

import { defined, mediaId, type SeedContext } from './context'
import { linkValue, markdownLinks } from './links'
import { markdownToLexical, richTextField } from './markdown'
import type { DemoBlock, DemoPage, Localized } from './schema'

// A page's demo blocks as Payload `layout` rows, in one locale. The rows are the same in every
// locale (the layout isn't localized, the texts inside are), so a block is kept or left out the
// same way in each one. Field names: demo/README.md, "Blocks" (the CMS and shop blocks use them as is).

/** A `layout` row; `id` is set on the other locales' write, to update the default locale's rows. */
export type LayoutRow = { blockType: DemoBlock['blockType']; id?: string } & Record<string, unknown>

/** What a page's blocks become, and the ones left out (with why). */
export type PageLayout = { rows: LayoutRow[]; skipped: string[] }

function richText(ctx: SeedContext, blockType: 'richText' | 'imageText', value: Localized, locale: Locale) {
  const markdown = value[locale]
  if (markdown === undefined) return undefined
  return markdownToLexical({
    field: richTextField(ctx.payload, 'pages', ['layout', blockType, 'content']),
    markdown,
    linkFields: markdownLinks(ctx, locale, 'pages'),
  })
}

/** One block in one locale, or the reason it is left out. */
function row(ctx: SeedContext, block: DemoBlock, locale: Locale): LayoutRow | string {
  switch (block.blockType) {
    case 'hero': {
      // The hero's link is optional: without a target on this site the hero has no button.
      const link = block.link && linkValue(ctx, block.link, locale)
      return defined({
        blockType: 'hero' as const,
        heading: block.heading[locale],
        text: block.text?.[locale],
        image: mediaId(ctx, block.image),
        link: link ?? undefined,
      })
    }
    case 'richText':
      return defined({ blockType: 'richText' as const, content: richText(ctx, 'richText', block.content, locale) })
    case 'imageText':
      return defined({
        blockType: 'imageText' as const,
        heading: block.heading?.[locale],
        content: richText(ctx, 'imageText', block.content, locale),
        image: mediaId(ctx, block.image),
        imagePosition: block.imagePosition,
        caption: block.caption?.[locale],
      })
    case 'callToAction': {
      // The button is the block: without its target there is nothing to call to.
      const link = linkValue(ctx, block.link, locale)
      if (!link) return `callToAction to ${block.link.type} "${block.link.slug}" (the shop is off)`
      return defined({ blockType: 'callToAction' as const, heading: block.heading[locale], text: block.text?.[locale], link })
    }
    case 'productGrid':
      if (!ctx.modules.productGrid) return 'productGrid (the shop is off)'
      return defined({
        blockType: 'productGrid' as const,
        heading: block.heading?.[locale],
        mode: 'selected' as const,
        products: block.products.map((slug) => {
          const id = ctx.products.get(slug)
          if (id === undefined) throw new Error(`The seed has no product ${slug}.`)
          return id
        }),
      })
  }
}

/** The page's `layout` in one locale. Pass the default locale's row ids to update those rows. */
export function pageLayout(ctx: SeedContext, page: DemoPage, locale: Locale, ids: (string | null | undefined)[] = []): PageLayout {
  const rows: LayoutRow[] = []
  const skipped: string[] = []
  for (const block of page.layout) {
    const result = row(ctx, block, locale)
    if (typeof result === 'string') skipped.push(result)
    else rows.push(ids[rows.length] ? { ...result, id: ids[rows.length]! } : result)
  }
  return { rows, skipped }
}
