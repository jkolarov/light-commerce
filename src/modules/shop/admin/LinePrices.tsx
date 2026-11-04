import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'

import { type LinePrice, readLinePrices } from '../collections/breakdown'
import { formatMoney } from '../money'

// An order's `linePrices` (collections/breakdown.ts) as a table instead of raw JSON: what each
// line was charged when the order was paid, and the order total. Read only. A server component,
// like every admin component here; the styles come from Payload's own variables.

const words = {
  fr: { title: 'Lignes de la commande', product: 'Produit', quantity: 'Quantité', unitPrice: 'Prix unitaire', lineTotal: 'Total ligne', total: 'Total de la commande', none: 'Aucune ligne.' },
  en: { title: 'Order lines', product: 'Product', quantity: 'Quantity', unitPrice: 'Unit price', lineTotal: 'Line total', total: 'Order total', none: 'No lines.' },
}

const cell = { padding: '0.375rem 0.75rem', borderBottom: '1px solid var(--theme-elevation-100, #e5e5e5)' } as const
const numeric = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' } as const

type Props = {
  lines: LinePrice[]
  /** Product name by product id; a product that is gone shows as its id. */
  names: Map<string, string>
  total: number | null
  currency: string
  language: string | undefined
}

/** The table itself, with everything already loaded. */
export function LinePricesTable({ lines, names, total, currency, language }: Props) {
  const locale: Locale = language === 'fr' ? 'fr' : 'en'
  const t = words[locale]
  const money = (cents: number) => formatMoney(cents, { currency, locale })
  return (
    <div className="field-type" style={{ marginBottom: 'var(--base, 1.5rem)' }}>
      <span className="field-label">{t.title}</span>
      {lines.length === 0 ? (
        <p>{t.none}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...cell, textAlign: 'left' }}>{t.product}</th>
              <th style={numeric}>{t.quantity}</th>
              <th style={numeric}>{t.unitPrice}</th>
              <th style={numeric}>{t.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.product}-${index}`}>
                <td style={cell}>{names.get(String(line.product)) ?? `#${line.product}`}</td>
                <td style={numeric}>{line.quantity}</td>
                <td style={numeric}>{money(line.unitPrice)}</td>
                <td style={numeric}>{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          {total === null ? null : (
            <tfoot>
              <tr>
                <th style={{ ...cell, textAlign: 'left' }} colSpan={3}>
                  {t.total}
                </th>
                <th style={numeric}>{money(total)}</th>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  )
}

type FieldProps = {
  data?: Record<string, unknown>
  i18n?: { language?: string }
  payload: Payload
  user?: unknown
}

/** The `linePrices` field of an order (`admin.components.Field`). */
export async function LinePrices({ data, i18n, payload, user }: FieldProps) {
  const lines = readLinePrices(data?.linePrices)
  const language = i18n?.language
  const ids = [...new Set(lines.map((line) => String(line.product)))]
  const names = new Map<string, string>()
  if (ids.length) {
    // Names in the admin's language, read as the person looking at the order.
    const { docs } = await payload.find({
      collection: 'products',
      where: { id: { in: ids } },
      locale: language === 'fr' ? 'fr' : 'en',
      depth: 0,
      pagination: false,
      trash: true,
      select: { title: true },
      user: user as never,
      overrideAccess: false,
    })
    for (const doc of docs) if (doc.title) names.set(String(doc.id), doc.title)
  }
  const total = typeof data?.amount === 'number' && Number.isInteger(data.amount) ? data.amount : null
  const currency = typeof data?.currency === 'string' && data.currency ? data.currency : 'EUR'
  return <LinePricesTable lines={lines} names={names} total={total} currency={currency} language={language} />
}
