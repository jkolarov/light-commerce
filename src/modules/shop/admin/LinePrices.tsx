import type { Payload } from 'payload'

import type { Locale } from '@/core/i18n/locales'

import { type LinePrice, readLinePrices } from '../collections/breakdown'
import { formatMoney } from '../money'

// An order's `linePrices` (collections/breakdown.ts) as a table instead of raw JSON: what each
// line was charged when the order was paid, and the order total. Read only. A server component,
// like every admin component here; the styles come from Payload's own variables.

const words = {
  fr: { title: 'Lignes de la commande', product: 'Produit', quantity: 'Quantité', unitPrice: 'Prix unitaire', lineTotal: 'Total ligne', subtotal: 'Sous-total', shipping: 'Livraison', total: 'Total de la commande', none: 'Aucune ligne.' },
  en: { title: 'Order lines', product: 'Product', quantity: 'Quantity', unitPrice: 'Unit price', lineTotal: 'Line total', subtotal: 'Subtotal', shipping: 'Shipping', total: 'Order total', none: 'No lines.' },
}

const cell = { padding: '0.375rem 0.75rem', borderBottom: '1px solid var(--theme-elevation-100, #e5e5e5)' } as const
const numeric = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' } as const

type Props = {
  lines: LinePrice[]
  /** Product name by product id; a product that is gone shows as its id. */
  names: Map<string, string>
  total: number | null
  /** What the lines add up to, and the shipping; shown above the total when known. */
  subtotal?: number | null
  shippingAmount?: number | null
  currency: string
  language: string | undefined
}

/** The table itself, with everything already loaded. */
export function LinePricesTable({ lines, names, total, subtotal = null, shippingAmount = null, currency, language }: Props) {
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
              {subtotal === null ? null : (
                <tr>
                  <td style={{ ...cell, textAlign: 'left' }} colSpan={3}>
                    {t.subtotal}
                  </td>
                  <td style={numeric}>{money(subtotal)}</td>
                </tr>
              )}
              {shippingAmount === null ? null : (
                <tr>
                  <td style={{ ...cell, textAlign: 'left' }} colSpan={3}>
                    {t.shipping}
                  </td>
                  <td style={numeric}>{money(shippingAmount)}</td>
                </tr>
              )}
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
  const cents = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : null)
  const total = typeof data?.amount === 'number' && Number.isInteger(data.amount) ? data.amount : null
  const currency = typeof data?.currency === 'string' && data.currency ? data.currency : 'EUR'
  return <LinePricesTable lines={lines} names={names} total={total} subtotal={cents(data?.subtotal)} shippingAmount={cents(data?.shippingAmount)} currency={currency} language={language} />
}
