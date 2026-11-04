import { getLightConfig } from '@/config'
import type { Order } from '@/payload-types'

import { buyerLocale } from '../collections/locale'
import { formatMoney } from '../money'
import { html } from './html'
import { box, button, emailDocument, heading, link, paragraph, textLines } from './layout'
import { emailTranslator } from './messages'
import { emailNotice } from './notice'
import { addressHtml, addressText, orderHeading, summaryHtml, summaryText } from './orderBlocks'
import type { RenderedEmail } from './orderConfirmation'
import { summarizeOrder } from './summary'

// The owner's notification of a paid order (S19), sent to `email.ownerNotificationsTo` in the
// site's default language: what needs attention first, when the order is flagged; the order and
// a link to it in the admin; the buyer and how to reach them (replying writes to the buyer); the
// lines, totals and address. Never the link to the order's page: its token is the buyer's key.

/** The order in the admin: `<site.url><routes.admin>/collections/orders/<id>`. */
export const adminOrderUrl = (order: Pick<Order, 'id'>, adminRoute = '/admin') =>
  new URL(`${adminRoute.replace(/\/+$/, '')}/collections/orders/${encodeURIComponent(String(order.id))}`, getLightConfig().site.url).toString()

/** `adminRoute`: Payload's `routes.admin` (the sender passes it; `/admin` by default). */
export function renderOwnerNotification(order: Order, opts: { adminRoute?: string } = {}): RenderedEmail {
  const config = getLightConfig()
  const { site, locales } = config
  const locale = locales.default
  const notice = emailNotice(config, locale)
  const t = emailTranslator(locale)
  const summary = summarizeOrder(order, locale)
  const context = { summary, t, locale }
  const { number, placed } = orderHeading(context)
  const total = formatMoney(summary.total, { currency: summary.currency, locale })
  const subject = t(order.needsAttention ? 'owner.subjectAttention' : 'owner.subject', { number: summary.number, total })
  const adminUrl = adminOrderUrl(order, opts.adminRoute)
  const language = t('owner.language', { language: new Intl.DisplayNames([locale], { type: 'language' }).of(buyerLocale(order.locale) ?? locale) ?? locale })
  const note = order.needsAttention ? (order.attentionNote ?? '').split('\n').map((line) => line.trim()).filter(Boolean) : []

  const buyer = [summary.name, summary.email, summary.phone, language].filter((line): line is string => Boolean(line))
  // The same lines in HTML, the email address as a link.
  const buyerHtml = html`${buyer.map((line, index) => html`${index ? html`<br>` : ''}${line === summary.email ? link(`mailto:${line}`, line) : line}`)}`
  const body = html`${order.needsAttention ? box(html`<strong>${t('owner.attention')}</strong>${note.length ? html`<br>${textLines(note)}` : ''}`, { accent: true }) : ''}
${heading(number, { size: 'large' })}
${paragraph(html`${t('owner.intro', { site: site.name })}<br>${placed}`)}
${button(adminUrl, t('owner.openInAdmin'))}
${heading(t('owner.buyer'))}
${paragraph(buyerHtml)}
${summaryHtml(context)}
${addressHtml(context)}
${summary.email ? paragraph(t('owner.replyHint'), { muted: true }) : ''}`

  const text = [
    ...(order.needsAttention ? [t('owner.attention'), ...note, ''] : []),
    number,
    t('owner.intro', { site: site.name }),
    placed,
    '',
    t('owner.openInAdminText', { url: adminUrl }),
    '',
    t('owner.buyer'),
    ...buyer,
    '',
    summaryText(context),
    '',
    addressText(context),
    ...(summary.email ? ['', t('owner.replyHint')] : []),
  ].join('\n')

  return {
    subject,
    html: emailDocument({ lang: locale, title: subject, preview: t('owner.preview', { name: summary.name ?? summary.email ?? '', total }), body, notice }),
    text: [text, notice].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n'),
  }
}
