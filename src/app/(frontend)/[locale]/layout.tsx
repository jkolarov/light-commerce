import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'
import { loadedFonts } from '@/theme/fonts'
import { loadFrame } from '@/theme/frame'
import { MAIN_ID, SiteFooter, SiteHeader, SkipLink } from '@/theme/layout'
import { asStyle, themeStyle } from '@/theme/themeStyle'
import '@/theme/globals.css'

// Root layout of the public site: the theme from light.config.ts (colours and fonts on <html>),
// then the header, the page and the footer. What the modules add (menus, cart) comes from
// src/theme/frame.tsx, which imports a module only when it is on.

// The menus are read from the database on each request, never at build time: the build runs
// against an empty database.
export const dynamic = 'force-dynamic'

type Props = {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export function generateMetadata(): Metadata {
  const { site } = getLightConfig()
  return {
    metadataBase: new URL(site.url),
    title: { default: site.name, template: `%s – ${site.name}` },
  }
}

export function generateViewport(): Viewport {
  return { themeColor: getLightConfig().theme.colors.background }
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  const config = getLightConfig()
  if (!isLocale(locale) || !config.locales.available.includes(locale)) notFound()
  setRequestLocale(locale)

  const { site, theme, locales } = config
  const frame = await loadFrame(locale, config)

  return (
    <html lang={locale} style={asStyle(themeStyle(theme, loadedFonts))}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <SkipLink />
          <SiteHeader
            locale={locale}
            locales={locales.available}
            siteName={site.name}
            logo={theme.logo}
            nav={frame.headerNav}
            shop={frame.shop}
            cart={frame.cart}
          />
          <main id={MAIN_ID} tabIndex={-1} className="flex-1">
            {children}
          </main>
          <SiteFooter
            locale={locale}
            locales={locales.available}
            siteName={site.name}
            logo={theme.logo}
            contactEmail={site.contactEmail}
            nav={frame.footerNav}
            text={frame.footerText}
            year={new Date().getFullYear()}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
