import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { Button, Container, Heading, textLink } from '@/theme'

import { shopPath } from '../products/paths'

type Props = {
  locale: Locale
  /** The server could not tell whether the payment went through. */
  checking: boolean
  contactEmail: string
}

/**
 * "Payment received": the order is on its way (it is created from Stripe's webhook when the
 * browser's own confirmation could not create it), and its confirmation arrives by email. Or, when
 * the server could not tell, where things stand and whom to ask.
 */
export function PaymentReceivedView({ locale, checking, contactEmail }: Props) {
  const t = useTranslations('checkout')
  const email = (chunks: ReactNode) => (
    <a href={`mailto:${contactEmail}`} className={textLink}>
      {chunks}
    </a>
  )
  return (
    <Container width="narrow" className="pt-14 pb-20 sm:pt-20 sm:pb-28">
      <Heading level={1} size="section">
        {checking ? t('checkingTitle') : t('receivedTitle')}
      </Heading>
      <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-text">
        {checking ? t.rich('checkingText', { address: contactEmail, email }) : t('receivedText')}
      </p>
      <Button href={shopPath(locale)} variant="secondary" className="mt-9">
        {t('backToShop')}
      </Button>
    </Container>
  )
}
