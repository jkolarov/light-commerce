import type { Locale } from './locales'

/**
 * Builds a locale-prefixed public path: `localePath('fr', '/cart')` is `/fr/cart`,
 * `localePath('en')` and `localePath('en', '/')` are `/en`. A query or hash stays at the end.
 */
export function localePath(locale: Locale, path = '/'): string {
  const rest = path.replace(/^\/+/, '')
  if (rest === '' ) return `/${locale}`
  return rest.startsWith('?') || rest.startsWith('#') ? `/${locale}${rest}` : `/${locale}/${rest}`
}
