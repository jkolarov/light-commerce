import type { Locale } from './locales'
import { isLocale } from './locales'

// Paths the locale routing never touches: the admin and its API, the Docker health check
// (its HEALTHCHECK follows redirects), Next's own files, and the root files crawlers fetch.
const UNPREFIXED = new Set(['admin', 'api', 'healthz', '_next'])
const ROOT_FILES = new Set(['/robots.txt', '/sitemap.xml', '/favicon.ico'])

export type LocaleRoute =
  | { kind: 'skip' } // not a public page: leave it alone
  | { kind: 'redirect'; to: string } // `/` goes to the default locale
  | { kind: 'page'; locale: Locale } // `/<locale>/...`
  | { kind: 'unknown' } // no valid locale prefix: the page route answers 404

/** Decides what the proxy does with a request path. Pure, so the table is easy to test. */
export function routeLocale(
  pathname: string,
  locales: { available: readonly Locale[]; default: Locale },
): LocaleRoute {
  if (pathname === '/') return { kind: 'redirect', to: `/${locales.default}` }
  const [, first = '', ...rest] = pathname.split('/')
  if (UNPREFIXED.has(first) || ROOT_FILES.has(pathname)) return { kind: 'skip' }
  // Any file in `public/` (logo.svg, images): the last segment has an extension.
  if (/\.[A-Za-z0-9]+$/.test(rest.at(-1) ?? first)) return { kind: 'skip' }
  if (isLocale(first) && locales.available.includes(first)) return { kind: 'page', locale: first }
  return { kind: 'unknown' }
}
