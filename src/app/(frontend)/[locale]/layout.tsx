import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

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
  if (!isLocale(locale)) notFound()

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
