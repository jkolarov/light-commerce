import type { Locale } from '@/core/i18n/locales'
import { pagePath } from '@/modules/cms/fields/link'
import { productPath } from '@/modules/shop/products/paths'

import type { SeedContext } from './context'
import type { LinkFieldsFor, LinkTarget } from './markdown'
import type { DemoLink } from './schema'

// Demo links name a page or a product by slug (demo/README.md, "Links"). The site's links are:
// - a page: an internal link to the page document, so it follows the page's slug in each language;
// - a product: a URL to its page, `/<locale>/shop/<slug>`, set per language (the link URL is
//   localized; the CMS has no link type for products and never imports the shop).
// A target whose module is off has no address: the caller drops the link.

/** The value of a block's or menu's `link` group in one locale, or `null` when the target is not on this site. */
export function linkValue(ctx: SeedContext, link: DemoLink, locale: Locale) {
  const label = link.label[locale]
  if (link.type === 'page') {
    const page = ctx.pages.get(link.slug)
    return page ? { type: 'page' as const, page: page.id, label } : null
  }
  return ctx.modules.shop ? { type: 'url' as const, url: productPath(locale, link.slug), label } : null
}

/**
 * Lexical link fields for Markdown links in one locale. `internal` is the collection the field's
 * editor links to internally: in page blocks, pages get an internal link; elsewhere (product
 * descriptions) a page gets a URL, since the shop draws internal links to products only.
 */
export function markdownLinks(ctx: SeedContext, locale: Locale, internal: 'pages' | null): LinkFieldsFor {
  return ({ type, slug }: LinkTarget) => {
    if (type === 'product') return ctx.modules.shop ? { linkType: 'custom', url: productPath(locale, slug) } : null
    const page = ctx.pages.get(slug)
    if (!page) return null
    if (internal === 'pages') return { linkType: 'internal', doc: { relationTo: 'pages', value: page.id } }
    return { linkType: 'custom', url: pagePath(page.slug[locale] ?? page.slug.fr, locale) }
  }
}
