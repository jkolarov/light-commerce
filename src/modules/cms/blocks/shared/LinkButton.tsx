import type { Locale } from '@/core/i18n/locales'

import { resolveLinkHref, type LinkValue } from '../../fields/link'
import { button } from './styles'

/**
 * Where a `linkField()` value goes and what it says, or `null` when it should not be shown: its
 * page is deleted, a draft or not loaded, the URL is not allowed, or there is no label.
 */
export function linkTarget(link: LinkValue, locale: Locale): { href: string; label: string } | null {
  const href = resolveLinkHref(link, locale)
  const label = link?.label?.trim()
  return href && label ? { href, label } : null
}

type Props = { link: LinkValue; locale: Locale; className?: string }

/** A `linkField()` value drawn as the site's button. Nothing at all for a link that goes nowhere: never a broken button. */
export function LinkButton({ link, locale, className }: Props) {
  const target = linkTarget(link, locale)
  if (!target) return null
  return (
    <a href={target.href} className={className ? `${button} ${className}` : button}>
      {target.label}
    </a>
  )
}
