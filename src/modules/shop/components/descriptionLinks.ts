import type { Locale } from '@/core/i18n/locales'
import type { LexicalLinkFields } from '@/payload-types'

import { productPath } from '../products/paths'

// Links inside a product description. The description uses the site's default editor, so a link
// may point anywhere: the shop follows the ones it can build safely and keeps the words of the rest.

// Whitespace or control characters inside a URL: browsers strip some of them (`/\t/evil.test`
// becomes `//evil.test`), so such a URL is refused. Phone numbers may have spaces.
const SPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f]/
const SITE_PATH = /^\/(?![/\\])/
const WEB = /^https?:\/\/[^/\\]/i
const MAILTO = /^mailto:[^\s<>"'`]+$/i
const TEL = /^tel:\+?[\d ().-]+$/i

/**
 * Where a description link goes, or `null` to show its words without a link. Internal links go to
 * a product (loaded with the description, so published); links to other collections, which the
 * shop has no address for, keep their words only. Custom URLs: site paths, http(s), mailto: and tel:.
 */
export function descriptionLinkHref(fields: Partial<LexicalLinkFields> | null | undefined, locale: Locale): string | null {
  if (!fields) return null
  if (fields.linkType === 'internal') {
    if (fields.doc?.relationTo !== 'products') return null
    const value = fields.doc.value as { slug?: unknown } | number | null | undefined
    return value && typeof value === 'object' && typeof value.slug === 'string' && value.slug ? productPath(locale, value.slug) : null
  }
  const url = typeof fields.url === 'string' ? fields.url.trim() : ''
  if (TEL.test(url)) return url
  if (!url || SPACE_OR_CONTROL.test(url)) return null
  return SITE_PATH.test(url) || WEB.test(url) || MAILTO.test(url) ? url : null
}
