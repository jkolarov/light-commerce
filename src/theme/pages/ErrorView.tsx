'use client'

import { useLocale, useTranslations } from 'next-intl'

import { isLocale } from '@/core/i18n/locales'
import { localePath } from '@/core/i18n/path'

import { Button } from '../components/Button'
import { Container } from '../components/Container'
import { Heading } from '../components/Heading'

/**
 * A page that failed, inside the site's header and footer: what happened, a retry, and the way
 * home. Never the error's own message, which may hold server details.
 */
export function ErrorView({ retry }: { retry: () => void }) {
  const t = useTranslations()
  const locale = useLocale()
  const home = isLocale(locale) ? localePath(locale) : '/'
  return (
    <Container className="py-20 sm:py-28 lg:py-36">
      <Heading level={1} className="max-w-[18ch]">{t('error.title')}</Heading>
      <p className="mt-6 max-w-[46ch] text-lg leading-[1.55] text-muted sm:text-xl">{t('error.text')}</p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button onClick={retry}>{t('error.retry')}</Button>
        <Button href={home} variant="secondary">
          {t('common.backToHome')}
        </Button>
      </div>
    </Container>
  )
}
