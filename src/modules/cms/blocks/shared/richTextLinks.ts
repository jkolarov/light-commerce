import type { Locale } from '@/core/i18n/locales'
import type { LexicalLinkFields } from '@/payload-types'

import { resolveLinkHref } from '../../fields/link'

// Contact links are fine in running text ("écrivez-nous"), even though block buttons only take
// site paths and http(s) URLs.
const MAILTO = /^mailto:[^\s<>"'`]+$/i
const TEL = /^tel:\+?[\d\s().-]+$/i

/**
 * Where a link inside rich text goes, or `null` to show its words without a link. An internal
 * link goes to a page through `resolveLinkHref`, so a page that is deleted, a draft or not loaded
 * gives `null`, the same as a block's button. Custom URLs: site paths, http(s), mailto: and tel:.
 */
export function richTextLinkHref(fields: Partial<LexicalLinkFields> | null | undefined, locale: Locale): string | null {
  if (!fields) return null
  if (fields.linkType === 'internal') {
    if (fields.doc?.relationTo !== 'pages') return null
    return resolveLinkHref({ type: 'page', page: fields.doc.value }, locale)
  }
  const url = typeof fields.url === 'string' ? fields.url.trim() : ''
  if (MAILTO.test(url) || TEL.test(url)) return url
  return resolveLinkHref({ type: 'url', url }, locale)
}
