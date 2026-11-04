import { useTranslations } from 'next-intl'
import Link from 'next/link'

import type { Locale } from '@/core/i18n/locales'
import type { NavItem } from '@/core/types'

import { Container } from '../components/Container'
import { cx, focusRing, textLink } from '../components/styles'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'

export type SiteFooterProps = {
  locale: Locale
  /** `locales.available` from light.config.ts. */
  locales: readonly Locale[]
  siteName: string
  logo: string
  /** `site.contactEmail` from light.config.ts. */
  contactEmail: string
  /** The CMS footer menu (legal pages included); empty when the CMS is off. */
  nav: NavItem[]
  /** The CMS footer's short text, like an address; `null` when there is none or the CMS is off. */
  text: string | null
  /** For the small print. */
  year: number
}

const footerLink = cx('rounded-[1px] text-text decoration-1 underline-offset-[0.3em] hover:underline', focusRing)

/** The site footer: logo and short text, the footer menu, the contact email, then the small print and the languages. */
export function SiteFooter({ locale, locales, siteName, logo, contactEmail, nav, text, year }: SiteFooterProps) {
  const t = useTranslations('footer')
  const navLabel = useTranslations('nav')('footerLabel')
  const languageLabel = useTranslations('common')('language')

  return (
    <footer className="mt-auto bg-surface">
      {/* Two columns on tablets (the contact under the logo), three from `lg`. */}
      <Container className="grid gap-x-12 gap-y-10 py-12 sm:py-16 md:grid-cols-2 lg:grid-cols-[5fr_3fr_4fr]">
        <div>
          <Logo locale={locale} logo={logo} siteName={siteName} className="h-8" />
          {/* A textarea: its line breaks are kept by CSS, and it is only ever text. */}
          {text && <p className="mt-6 max-w-[38ch] leading-[1.6] whitespace-pre-line text-muted">{text}</p>}
        </div>

        {nav.length > 0 && (
          <nav aria-label={navLabel}>
            <ul className="space-y-3">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={footerLink}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className={cx(nav.length === 0 && 'lg:col-start-3')}>
          <h2 className="font-body text-[0.9375rem] text-muted">{t('contact')}</h2>
          <p className="mt-3 break-words">
            <a href={`mailto:${contactEmail}`} className={textLink}>
              {contactEmail}
            </a>
          </p>
        </div>
      </Container>

      <div className="border-t border-text/15">
        <Container className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-5 text-[0.9375rem] text-muted">
          <p>{t('copyright', { year, siteName })}</p>
          <LanguageSwitch label={languageLabel} locale={locale} locales={locales} />
        </Container>
      </div>
    </footer>
  )
}
