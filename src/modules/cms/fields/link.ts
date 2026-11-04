import type { Field, TextFieldSingleValidation } from 'payload'

import type { Locale } from '@/core/i18n/locales'

import { requiredInDefaultLocale } from './requiredInDefaultLocale'
import { HOME_SLUG } from './slugs'

// The link used by blocks (S10) and menus (S11): a page of the site or a URL, with a label per
// language. Read the page with depth 1 (Payload's default) so `resolveLinkHref` can see it.

/** A page link or URL link as Payload returns it. `page` is the populated page, or an id. */
export type LinkValue = {
  type?: 'page' | 'url' | null
  label?: string | null
  page?: unknown
  url?: string | null
} | null | undefined

type PageLike = {
  _status?: string | null
  slug?: string | Partial<Record<Locale, string | null>> | null
}

// ASCII whitespace and control characters (U+0000 to U+0020, U+007F). Browsers strip tab and
// newline anywhere in a URL, so `/\t/host` would become `//host`. None of them belong in a link.
const WHITESPACE_OR_CONTROL = /[\u0000- \u007f]/

/** Site-relative path (`/fr/shop/x`) or absolute http(s) URL. Nothing else: no `javascript:`, no `//host`. */
export function isValidLinkUrl(value: string): boolean {
  if (WHITESPACE_OR_CONTROL.test(value)) return false
  // Browsers read `/\host` like `//host`, so a backslash after the first slash is out too.
  if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\')
  return /^https?:\/\/\S+$/i.test(value)
}

/**
 * `linkField()`: an internal page or a URL, and a localized label. The URL is localized too, so a
 * link can point to `/fr/shop/x` in French and `/en/shop/x` in English.
 */
export function linkField(name = 'link'): Field {
  return {
    name,
    type: 'group',
    label: { en: 'Link', fr: 'Lien' },
    fields: [ 
      {
        name: 'type',
        type: 'radio',
        label: { en: 'Type', fr: 'Type' },
        defaultValue: 'page',
        options: [
          { label: { en: 'Page', fr: 'Page' }, value: 'page' },
          { label: { en: 'URL', fr: 'Adresse (URL)' }, value: 'url' },
        ],
      },
      { name: 'label', type: 'text', label: { en: 'Label', fr: 'Libellé' }, localized: true, validate: requiredInDefaultLocale },
      {
        name: 'page',
        type: 'relationship',
        label: { en: 'Page', fr: 'Page' },
        relationTo: 'pages',
        admin: { condition: (_, siblingData) => siblingData?.type !== 'url' },
        validate: (value: unknown, { siblingData }: { siblingData: { type?: string } }) =>
          siblingData?.type === 'url' || value ? true : 'This page no longer exists. Choose another page or remove this item.',
      },
      {
        name: 'url',
        type: 'text',
        label: { en: 'URL', fr: 'Adresse (URL)' },
        localized: true,
        admin: {
          condition: (_, siblingData) => siblingData?.type === 'url',
          description: {
            en: 'A path on this site (for example /fr/shop/tisane) or a full https:// address.',
            fr: 'Un chemin de ce site (par exemple /fr/shop/tisane) ou une adresse complète en https://.',
          },
        },
        validate: ((value, options) => {
          if ((options.siblingData as { type?: string } | undefined)?.type !== 'url') return true
          if (typeof value !== 'string' || !value) return requiredInDefaultLocale(value, options)
          return isValidLinkUrl(value) || 'Use a path starting with / or a full http(s):// address.'
        }) satisfies TextFieldSingleValidation,
      },
    ],
  }
}

/** The public path of a page in one language. The home page is `/<locale>`. */
export function pagePath(slug: string, locale: Locale): string {
  return slug === HOME_SLUG ? `/${locale}` : `/${locale}/${slug}`
}

/**
 * Where a link goes, or `null` when it should not be shown: the target page is deleted, still a
 * draft, or was not loaded (pass a link read with depth 1).
 */
export function resolveLinkHref(link: LinkValue, locale: Locale): string | null {
  if (!link) return null
  if (link.type === 'url') {
    const url = link.url?.trim()
    return url && isValidLinkUrl(url) ? url : null
  }
  const page = link.page as PageLike | string | number | null | undefined
  if (!page || typeof page !== 'object') return null
  if (page._status !== 'published') return null
  const slug = typeof page.slug === 'string' ? page.slug : (page.slug?.[locale] ?? null)
  return slug ? pagePath(slug, locale) : null
}
