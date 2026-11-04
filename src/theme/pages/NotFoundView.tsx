import { useLocale, useTranslations } from 'next-intl'

import { isLocale } from '@/core/i18n/locales'
import { localePath } from '@/core/i18n/path'

import { Button } from '../components/Button'
import { Container } from '../components/Container'
import { Heading } from '../components/Heading'

/** The 404 page, inside the site's header and footer: what happened, and the way home. */
export function NotFoundView() {
  const t = useTranslations()
  const locale = useLocale()
  const home = isLocale(locale) ? localePath(locale) : '/'
  return (
    <Container width="narrow" className="py-20 sm:py-28 lg:py-36">
      <Heading level={1}>{t('notFound.title')}</Heading>
      <p className="mt-6 max-w-[46ch] text-lg leading-[1.55] text-muted sm:text-xl">{t('notFound.text')}</p>
      <div className="mt-10">
        <Button href={home}>{t('common.backToHome')}</Button>
      </div>
    </Container>
  )
}
