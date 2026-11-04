import Link from 'next/link'
import { useTranslations } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'
import type { Product } from '@/payload-types'
import { Badge, cx, focusRing, Heading, MediaImage } from '@/theme'

import { shopConfig } from '../config'
import { formatMoney } from '../money'
import { productPath } from '../products/paths'
import { productPrice, type PriceFields } from '../products/price'
import { stockState } from '../products/stock'
import { PhotoTile, tilePhoto } from './PhotoTile'

/** What a card reads from a product. A full `Product`, as a relationship gives it at depth 1, fits. */
export type ProductCardProduct = Pick<Product, 'title' | 'slug' | 'summary' | 'images' | 'inventory'> & PriceFields

export type ProductCardProps = {
  /** A product read for visitors (published), with its first photo loaded (depth 1). */
  product: ProductCardProduct
  locale: Locale
  /** The name's heading level: 2 under the shop page's h1 (default), 3 under a block's own h2. */
  headingLevel?: 2 | 3
}

// Drawn about 19rem wide in three columns, 40 % of the screen in two (the tile's margin included).
const sizes = '(min-width: 76rem) 19rem, (min-width: 64rem) 27vw, 40vw'

/**
 * One product in a grid: its first photo on a `surface` tile, the name in the heading font (the
 * link to the product page; the whole card is clickable), the one-line summary and the price, plus
 * "Épuisé" when the stock is 0. The shop page lists these, and so does the CMS's product grid block.
 */
export function ProductCard({ product, locale, headingLevel = 2 }: ProductCardProps) {
  const t = useTranslations('shop')
  const { currency } = shopConfig()
  const price = productPrice(product, currency)
  const soldOut = stockState(product.inventory) === 'soldOut'
  const summary = product.summary?.trim()

  return (
    <article className="relative flex flex-col">
      <PhotoTile>
        <MediaImage media={product.images?.[0]} sizes={sizes} className={tilePhoto} />
      </PhotoTile>
      <Heading level={headingLevel} size="title" className="mt-4">
        <Link
          href={productPath(locale, product.slug)}
          className={cx(
            'rounded-[1px] decoration-1 underline-offset-[0.2em] hover:underline',
            // The whole card is the link's click area; the name stays its only text.
            'after:absolute after:inset-0',
            focusRing,
          )}
        >
          {product.title}
        </Link>
      </Heading>
      {summary && <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted sm:text-base">{summary}</p>}
      {(price !== null || soldOut) && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {price !== null && <span className="font-semibold tabular-nums">{formatMoney(price, { currency, locale })}</span>}
          {soldOut && <Badge tone="accent">{t('outOfStock')}</Badge>}
        </p>
      )}
    </article>
  )
}
