'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import type { Locale } from '@/core/i18n/locales'

import { cx, focusRing } from '../components/styles'
import { languageLinks } from '../language'

type Props = {
  /** The list's name for screen readers ("Langue"). */
  label: string
  locale: Locale
  /** `locales.available` from light.config.ts. */
  locales: readonly Locale[]
  className?: string
}

/**
 * Links to this page in the site's other languages (see `switchLocalePath` for how the address is
 * built, and its limit). Plain links, so the whole page, `<html lang>` included, reloads in the
 * new language. Nothing when the site has one language.
 */
export function LanguageSwitch(props: Props) {
  const pathname = usePathname()
  if (props.locales.length < 2) return null
  // The query string is read on the client; the links without it are shown until then.
  return (
    <Suspense fallback={<LanguageLinks {...props} pathname={pathname} search="" />}>
      <WithQuery {...props} pathname={pathname} />
    </Suspense>
  )
}

function WithQuery(props: Props & { pathname: string | null }) {
  const search = useSearchParams()
  return <LanguageLinks {...props} search={search?.toString() ?? ''} />
}

/** The switch for a given address. Each language in its own name; the current one is not a link. */
export function LanguageLinks({ label, locale, locales, pathname, search, className }: Props & { pathname: string | null; search: string }) {
  if (locales.length < 2) return null
  const links = languageLinks({ pathname, search, current: locale, available: locales })
  return (
    <ul aria-label={label} className={cx('flex items-center gap-x-4', className)}>
      {links.map((link) => (
        <li key={link.locale}>
          {link.current ? (
            <span
              aria-current="true"
              lang={link.locale}
              className="text-text underline decoration-primary decoration-2 underline-offset-[0.4em]"
            >
              {link.name}
            </span>
          ) : (
            <a
              href={link.href}
              hrefLang={link.locale}
              lang={link.locale}
              className={cx(
                'rounded-[1px] text-muted decoration-1 underline-offset-[0.4em] hover:text-text hover:underline',
                focusRing,
              )}
            >
              {link.name}
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
