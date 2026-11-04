import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { localePath } from '@/core/i18n/path'
import type { NavItem } from '@/core/types'

import { Container } from '../components/Container'
import { cx, focusRing } from '../components/styles'
import type { LogoImage } from '../logo'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { MobileMenu } from './MobileMenu'
import { NavLink } from './NavLink'

export type SiteHeaderProps = {
  locale: Locale
  /** `locales.available` from light.config.ts. */
  locales: readonly Locale[]
  siteName: string
  /** The logo and its size (`logoImage`). */
  logo: LogoImage
  /** The CMS header menu; empty when the CMS is off. */
  nav: NavItem[]
  /** Whether the shop is on: adds the shop link. */
  shop: boolean
  /** The shop's cart button, or nothing when the shop is off. */
  cart: ReactNode
}

/** The menu links, then the shop, unless the menu already links to it. */
function headerLinks({ nav, shop, locale }: SiteHeaderProps, shopLabel: string): NavItem[] {
  const shopHref = localePath(locale, '/shop')
  if (!shop || nav.some((item) => item.href === shopHref)) return nav
  return [...nav, { label: shopLabel, href: shopHref }]
}

const desktopLink = cx(
  'rounded-[1px] text-[1.0625rem] text-text decoration-1 underline-offset-[0.45em] hover:underline',
  'aria-[current=page]:underline aria-[current=page]:decoration-primary aria-[current=page]:decoration-2',
  focusRing,
)

const mobileLink = cx(
  'flex min-h-12 items-center rounded-[1px] text-xl text-text',
  'aria-[current=page]:underline aria-[current=page]:decoration-primary aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[0.35em]',
  focusRing,
)

/**
 * The site header: logo, menu (the CMS's links and the shop), language switch and cart. From the
 * `lg` breakpoint the menu is a row of links; below it, a "Menu" button opens it under the header.
 */
export function SiteHeader(props: SiteHeaderProps) {
  const { locale, locales, siteName, logo, cart } = props
  const t = useTranslations('nav')
  const languageLabel = useTranslations('common')('language')
  const links = headerLinks(props, t('shop'))
  const hasMenu = links.length > 0 || locales.length > 1

  return (
    <header className="relative border-b border-text/15">
      <Container className="flex min-h-[4.25rem] items-center gap-x-10 py-3 lg:min-h-[5.5rem]">
        <Logo locale={locale} image={logo} siteName={siteName} priority className="h-7 sm:h-8" />

        {links.length > 0 && (
          <nav aria-label={t('mainLabel')} className="hidden lg:block">
            <ul className="flex flex-wrap gap-x-7 gap-y-2">
              {links.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} className={desktopLink}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-x-6">
          <LanguageSwitch label={languageLabel} locale={locale} locales={locales} className="hidden text-[0.9375rem] lg:flex" />
          {cart}
          {hasMenu && (
            <MobileMenu label={t('menu')} className="lg:hidden">
              <Container className="pt-2 pb-6">
                {links.length > 0 && (
                  <nav aria-label={t('mainLabel')}>
                    <ul className="divide-y divide-text/15">
                      {links.map((item) => (
                        <li key={item.href}>
                          <NavLink href={item.href} className={mobileLink}>
                            {item.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
                <LanguageSwitch label={languageLabel} locale={locale} locales={locales} className="mt-2 border-t border-text/15 pt-5" />
              </Container>
            </MobileMenu>
          )}
        </div>
      </Container>
    </header>
  )
}
