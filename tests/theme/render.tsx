import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { Locale } from '@/core/i18n/locales'

import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

const messages = { fr, en }

/** Static markup of a theme component, with the public site's UI strings for `locale`. */
export function render(node: ReactNode, locale: Locale = 'fr'): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {node}
    </NextIntlClientProvider>,
  )
}

/** The `href` of every link, in order. */
export function hrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) => match[1] ?? '')
}
