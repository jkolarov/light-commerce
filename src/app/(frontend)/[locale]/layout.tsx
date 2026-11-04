import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'
import '@/theme/globals.css'

// Root layout of the public site. Bare until S22 adds the theme, header and footer.

export const metadata: Metadata = {
  title: 'light-commerce',
}

type Props = {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !getLightConfig().locales.available.includes(locale)) notFound()
  setRequestLocale(locale)

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
