import { isLocale, type Locale } from '@/core/i18n/locales'

/** Each language in its own language, as the switch shows it. */
export const languageNames: Record<Locale, string> = { fr: 'Français', en: 'English' }

/**
 * The same address in another language: swaps the locale prefix and keeps the rest of the path and
 * the query (`/fr/order/12?token=…` → `/en/order/12?token=…`). A path without a locale prefix goes
 * to the other language's home page.
 *
 * Limit: CMS page slugs differ per language (`/fr/a-propos`, `/en/about`). The page route answers
 * `/en/a-propos` with a redirect to `/en/about`, so swapping the prefix is enough. It lands on the
 * wrong page only when another page uses that same slug in the target language (a French `contact`
 * page whose English slug is `contact-us`, next to an English page whose slug is `contact`). To fix
 * that, a page would pass its own translated addresses (its `hreflang` alternates) to the switch.
 *
 * Shop routes (`/shop/<product>`, cart, checkout, order) need nothing more: a product has one slug
 * shared by both languages (plan, "Collections, blocks, routes"), so the swapped address is right.
 */
export function switchLocalePath(pathname: string | null, target: Locale, search = ''): string {
  const query = search.replace(/^\?/, '')
  const suffix = query ? `?${query}` : ''
  const [, first = '', ...rest] = (pathname ?? '').split('/')
  if (!isLocale(first)) return `/${target}${suffix}`
  const path = rest.join('/').replace(/\/+$/, '')
  return `${path ? `/${target}/${path}` : `/${target}`}${suffix}`
}

export type LanguageLink = { locale: Locale; name: string; href: string; current: boolean }

/** One entry per available locale, in config order, for the language switch. */
export function languageLinks(args: {
  pathname: string | null
  search?: string
  current: Locale
  available: readonly Locale[]
}): LanguageLink[] {
  return args.available.map((locale) => ({
    locale,
    name: languageNames[locale],
    href: switchLocalePath(args.pathname, locale, args.search),
    current: locale === args.current,
  }))
}
