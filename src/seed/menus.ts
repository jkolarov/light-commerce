import type { Locale } from '@/core/i18n/locales'
import type { Footer, Header } from '@/payload-types'

import { defined, type SeedContext } from './context'
import type { DemoContent } from './demo'
import { linkValue } from './links'
import type { DemoLink } from './schema'

// The header and footer menus (CMS on), from menus.json, in order. The footer's short line comes
// from the taglines in brand.md (demo/README.md, "content/menus.json"). Menu rows are shared by
// every locale, so the other locales' write sends the rows' ids.

type Items = NonNullable<Header['items']>

function items(ctx: SeedContext, links: DemoLink[], locale: Locale, ids: (string | null | undefined)[] = []): Items {
  return links.flatMap((link) => {
    const value = linkValue(ctx, link, locale)
    return value ? [{ link: value }] : []
  }).map((item, i) => (ids[i] ? { ...item, id: ids[i] } : item))
}

export async function seedMenus(ctx: SeedContext, demo: DemoContent): Promise<void> {
  const { payload, locales } = ctx
  const write = { depth: 0, overrideAccess: true } as const

  const header = await payload.updateGlobal({
    slug: 'header',
    data: { items: items(ctx, demo.menus.header, locales.default) },
    locale: locales.default,
    ...write,
  })
  const footer = await payload.updateGlobal({
    slug: 'footer',
    data: { text: demo.footerText?.[locales.default] ?? null, items: items(ctx, demo.menus.footer, locales.default) },
    locale: locales.default,
    ...write,
  })
  const headerIds = (header.items ?? []).map((item) => item.id)
  const footerIds = (footer.items ?? []).map((item) => item.id)
  for (const locale of locales.others) {
    await payload.updateGlobal({ slug: 'header', data: { items: items(ctx, demo.menus.header, locale, headerIds) }, locale, ...write })
    const data: Partial<Footer> = defined({ text: demo.footerText?.[locale], items: items(ctx, demo.menus.footer, locale, footerIds) })
    await payload.updateGlobal({ slug: 'footer', data, locale, ...write })
  }
  ctx.log(`Menus: header ${headerIds.length} links, footer ${footerIds.length} links${demo.footerText ? ' and a short line' : ''}.`)
}
