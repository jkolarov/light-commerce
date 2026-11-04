import { useTranslations } from 'next-intl'

import type { Product } from '@/payload-types'

type Props = { facts: Product['facts']; className?: string }

/**
 * The product's facts as label and value rows, in the order the admin gives them (plant, harvest,
 * net weight…), between hairlines. Rows with neither are skipped; nothing when there are none.
 */
export function ProductFacts({ facts, className }: Props) {
  const t = useTranslations('shop')
  const rows = (facts ?? []).filter((fact) => fact.label?.trim() || fact.value?.trim())
  if (!rows.length) return null
  return (
    <section className={className}>
      <h2 className="sr-only">{t('facts')}</h2>
      <dl className="border-b border-text/15">
        {rows.map((fact, index) => (
          <div key={fact.id ?? index} className="grid grid-cols-[minmax(6.5rem,2fr)_5fr] gap-x-5 border-t border-text/15 py-3">
            <dt className="text-muted">{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
