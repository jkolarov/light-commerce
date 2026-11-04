import { notFound } from 'next/navigation'

import { isLocale, type Locale } from '@/core/i18n/locales'

import en from '../../../../messages/en.json'
import fr from '../../../../messages/fr.json'

// Placeholder home page. S09 replaces it with the CMS `home` page, or the shop's product list
// when the CMS is off.

const messages: Record<Locale, typeof fr> = { fr, en }

type Props = {
  params: Promise<{ locale: string }>
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = messages[locale].placeholder

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-3xl text-primary">{t.title}</h1>
      <p className="mt-4 text-muted">{t.body}</p>
    </main>
  )
}
