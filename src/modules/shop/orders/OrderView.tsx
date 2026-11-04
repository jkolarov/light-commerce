import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Locale } from '@/core/i18n/locales'
import { Button, Container, Heading, textLink } from '@/theme'

import { CheckoutSummary } from '../checkout/CheckoutSummary'
import { shopPath } from '../products/paths'
import type { OrderView as Order } from './load'

type Props = {
  order: Order
  locale: Locale
  /** `site.contactEmail`: where to write when something is wrong. */
  contactEmail: string
}

/** One block of the details grid: a small heading, then its lines. */
function Detail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-body text-[0.9375rem] font-semibold text-text">{title}</dt>
      <dd className="mt-1.5 leading-relaxed text-text">{children}</dd>
    </div>
  )
}

/**
 * The order's confirmation page (docs/design/visual-references.md, "Confirmation"): a warm "thank
 * you" with the order number, the details (contact, shipping, payment), and the summary on the
 * right, the same as at the checkout. A line says whom to write to if something is wrong.
 */
export function OrderView({ order, locale, contactEmail }: Props) {
  const t = useTranslations('order')
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(order.createdAt))
  const email = (chunks: ReactNode) => (
    <a href={`mailto:${contactEmail}`} className={textLink}>
      {chunks}
    </a>
  )
  return (
    <Container className="pt-10 pb-16 sm:pt-14 sm:pb-24">
      <p className="text-muted">{t('placed', { number: order.id, date })}</p>
      <Heading level={1} size="section" className="mt-3">
        {order.firstName ? t('thankYouName', { name: order.firstName }) : t('thankYou')}
      </Heading>
      <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-text">{t('intro')}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <aside
          aria-labelledby="order-summary"
          className="rounded-[0.25rem] bg-surface px-6 py-6 sm:px-8 sm:py-7 lg:col-start-2 lg:row-start-1 lg:self-start"
        >
          <CheckoutSummary cart={order.summary} locale={locale} headingId="order-summary" />
        </aside>

        <section aria-labelledby="order-details" className="min-w-0 border-t border-text/15 pt-8 lg:col-start-1 lg:row-start-1">
          <Heading level={2} size="title" id="order-details">
            {t('details')}
          </Heading>
          <dl className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            <Detail title={t('contact')}>
              {order.email && <span className="block break-words">{order.email}</span>}
              {order.phone && <span className="block">{order.phone}</span>}
            </Detail>
            <Detail title={t('shippingAddress')}>
              {order.address.map((line, index) => (
                <span key={index} className="block">
                  {line}
                </span>
              ))}
            </Detail>
            <Detail title={t('payment')}>
              <span className="block">{t('paidOn', { date })}</span>
            </Detail>
            <Detail title={t('status')}>
              <span className="block">{t(`statuses.${order.status}`)}</span>
            </Detail>
          </dl>

          <div className="mt-10 space-y-2 border-t border-text/15 pt-6 text-[0.9375rem] leading-snug text-muted">
            <p>{t('keepLink')}</p>
            <p>{t.rich('question', { address: contactEmail, email })}</p>
          </div>
          <Button href={shopPath(locale)} variant="secondary" className="mt-8">
            {t('backToShop')}
          </Button>
        </section>
      </div>
    </Container>
  )
}
