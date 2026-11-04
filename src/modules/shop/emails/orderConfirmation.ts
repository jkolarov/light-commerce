import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import type { Order } from '@/payload-types'

import { orderPath } from '../checkout/paths'
import { html } from './html'
import { button, emailDocument, heading, linkWithin, paragraph } from './layout'
import { emailTranslator } from './messages'
import { addressHtml, addressText, orderHeading, summaryHtml, summaryText } from './orderBlocks'
import { summarizeOrder } from './summary'

// The buyer's order confirmation (S19), in the buyer's language: the order number and date, the
// lines and totals, the shipping address, the link to the order's page (with its access token:
// the buyer's key to the order, so it is in this email only), and whom to write to. Pure: the
// sender reads the order, its products' names in `locale`, and sends (./send.ts).

export type RenderedEmail = { subject: string; html: string; text: string }

/** The absolute URL of the order's page, `/[locale]/order/[id]?token=…`, or `null` without a token. */
export function orderPageUrl(order: Order, locale: Locale): string | null {
  if (!order.accessToken) return null
  return new URL(orderPath(locale, order.id, order.accessToken), getLightConfig().site.url).toString()
}

export function renderOrderConfirmation(order: Order, locale: Locale): RenderedEmail {
  const { site } = getLightConfig()
  const t = emailTranslator(locale)
  const summary = summarizeOrder(order, locale)
  const context = { summary, t, locale }
  const url = orderPageUrl(order, locale)
  const greeting = summary.firstName ? t('confirmation.greeting', { name: summary.firstName }) : t('confirmation.greetingNoName')
  const { number, placed } = orderHeading(context)
  const question = t('confirmation.question', { address: site.contactEmail })
  const subject = t('confirmation.subject', { number: summary.number })

  const body = html`${heading(greeting, { size: 'large' })}
${paragraph(t('confirmation.intro'))}
${paragraph(html`<strong>${number}</strong><br>${placed}`)}
${url ? button(url, t('confirmation.viewOrder')) : ''}
${summaryHtml(context)}
${addressHtml(context)}
${url ? paragraph(t('confirmation.keepLink'), { muted: true }) : ''}
${paragraph(linkWithin(question, site.contactEmail, `mailto:${site.contactEmail}`))}
${paragraph(html`${t('confirmation.signOff')}<br>${site.name}`)}`

  const text = [
    greeting,
    '',
    t('confirmation.intro'),
    '',
    number,
    placed,
    ...(url ? ['', t('confirmation.viewOrderText', { url }), t('confirmation.keepLink')] : []),
    '',
    summaryText(context),
    '',
    addressText(context),
    '',
    question,
    '',
    t('confirmation.signOff'),
    site.name,
    site.url,
  ].join('\n')

  return {
    subject,
    html: emailDocument({ lang: locale, title: subject, preview: t('confirmation.preview'), body }),
    text: text.replace(/\n{3,}/g, '\n\n'),
  }
}
