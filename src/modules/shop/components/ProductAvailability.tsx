import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Badge } from '@/theme'

import type { StockState } from '../products/stock'

type Props = {
  stock: StockState
  /** Units in stock, for "Plus que 3 en stock". */
  inventory: number | null | undefined
  /** Whether the product can be bought: it has a price and is not sold out. */
  purchasable: boolean
  /** The add-to-cart control (S16), drawn only when the product can be bought. */
  addToCart?: ReactNode
  className?: string
}

/**
 * Stock and the place where the visitor acts. A sold-out product says so in words, and never gets
 * the add-to-cart control; otherwise the stock ("En stock", or how many are left when few), then
 * the control.
 */
export function ProductAvailability({ stock, inventory, purchasable, addToCart, className }: Props) {
  const t = useTranslations('shop')
  if (stock === 'soldOut') {
    return (
      <div className={className}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone="accent">{t('outOfStock')}</Badge>
          <span className="text-muted">{t('soldOutNotice')}</span>
        </p>
      </div>
    )
  }
  return (
    <div className={className}>
      <p className={stock === 'low' ? 'text-text' : 'text-muted'}>
        {stock === 'low' ? t('lowStock', { count: inventory ?? 0 }) : t('inStock')}
      </p>
      {purchasable && addToCart && <div className="mt-5">{addToCart}</div>}
    </div>
  )
}
