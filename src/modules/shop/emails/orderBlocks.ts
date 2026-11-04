import type { Locale } from '@/core/i18n/locales'

import { formatMoney } from '../money'
import { formatTaxRate } from '../products/price'
import { html, type SafeHtml } from './html'
import { amountRows, box, heading, lineRow, paragraph, textLines } from './layout'
import type { EmailTranslator } from './messages'
import type { OrderSummary } from './summary'

// The parts of an order both emails show, in HTML and in plain text: the lines with their
// amounts, subtotal, shipping, total and the VAT note, and the shipping address.

type Context = { summary: OrderSummary; t: EmailTranslator; locale: Locale }

const moneyOf = ({ summary, locale }: Context) => (cents: number) => formatMoney(cents, { currency: summary.currency, locale })

const lineName = ({ t }: Context, name: string | null) => name ?? t('unavailableName')

/** "Commande n° 1042" and "Passée le 4 novembre 2026". */
export const orderHeading = ({ summary, t }: Context) => ({ number: t('orderNumber', { number: summary.number }), placed: t('placedOn', { date: summary.date }) })

/** The lines and totals, in a tinted box. */
export function summaryHtml(context: Context): SafeHtml {
  const { summary, t } = context
  const money = moneyOf(context)
  const lines = summary.lines.map((line, index) =>
    lineRow(lineName(context, line.name), t('quantity', { count: line.quantity }), line.lineTotal === null ? null : money(line.lineTotal), index === 0),
  )
  return box(html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines}</table>
${amountRows([
  { label: t('subtotal'), value: money(summary.subtotal), separated: true },
  { label: t('shipping'), value: money(summary.shipping), separated: true },
  { label: t('total'), value: money(summary.total), strong: true, separated: true },
])}
${paragraph(t('pricesIncludeTax', { rate: formatTaxRate(summary.taxRate, context.locale) }), { muted: true })}`)
}

export function summaryText(context: Context): string {
  const { summary, t } = context
  const money = moneyOf(context)
  const row = (label: string, value: string) => t('row', { label, value })
  return [
    t('summary'),
    ...summary.lines.map((line) => `- ${line.quantity} × ${lineName(context, line.name)}${line.lineTotal === null ? '' : ` — ${money(line.lineTotal)}`}`),
    '',
    row(t('subtotal'), money(summary.subtotal)),
    row(t('shipping'), money(summary.shipping)),
    row(t('total'), money(summary.total)),
    t('pricesIncludeTax', { rate: formatTaxRate(summary.taxRate, context.locale) }),
  ].join('\n')
}

export function addressHtml({ summary, t }: Context): SafeHtml {
  if (!summary.address.length) return html``
  return html`${heading(t('shippingAddress'))}${paragraph(textLines(summary.address))}`
}

export function addressText({ summary, t }: Context): string {
  return summary.address.length ? [t('shippingAddress'), ...summary.address].join('\n') : ''
}
