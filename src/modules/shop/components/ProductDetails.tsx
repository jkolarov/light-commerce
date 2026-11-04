import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Locale } from '@/core/i18n/locales'
import type { Product } from '@/payload-types'
import { Container, cx, focusRing, Heading } from '@/theme'
import { asMedia, imageAttributes, thumbnailAttributes } from '@/theme/media'

import { shopConfig } from '../config'
import { formatMoney } from '../money'
import { shopPath } from '../products/paths'
import { formatTaxRate, productPrice } from '../products/price'
import { stockState } from '../products/stock'
import { ProductAvailability } from './ProductAvailability'
import { ProductDescription } from './ProductDescription'
import { ProductFacts } from './ProductFacts'
import { type GalleryPhoto, ProductGallery } from './ProductGallery'

type Props = {
  /** A published product read for visitors at depth 1 (photos loaded), in the page's language. */
  product: Product
  locale: Locale
  /** The add-to-cart control (S16). Never drawn for a sold-out product or one without a price. */
  addToCart?: ReactNode
}

// The large photo: about 33rem in the left column on wide screens, the screen's width on phones
// (the tile's margin included).
const photoSizes = '(min-width: 76rem) 33rem, (min-width: 64rem) 48vw, 86vw'

/**
 * The product page: the photos on the left (they stay in view while the text scrolls), and on the
 * right the name, the summary, the price with its tax rate, stock and the add-to-cart control,
 * the facts and the description. On phones it all stacks, photos first.
 */
export function ProductDetails({ product, locale, addToCart }: Props) {
  const t = useTranslations('shop')
  const { currency, displayTaxRate } = shopConfig()
  const price = productPrice(product, currency)
  const stock = stockState(product.inventory)
  const summary = product.summary?.trim()
  const photos: GalleryPhoto[] = (product.images ?? []).flatMap((image) => {
    const media = asMedia(image)
    return media ? [{ image: imageAttributes(media, photoSizes), thumbnail: thumbnailAttributes(media) }] : []
  })

  return (
    <Container className="pt-6 pb-16 sm:pt-8 sm:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-[0.9375rem]">
        <ol className="flex flex-wrap gap-x-2 text-muted">
          <li>
            <Link href={shopPath(locale)} className={cx('rounded-[1px] underline decoration-1 underline-offset-[0.2em] hover:text-text', focusRing)}>
              {t('title')}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-text">
            {product.title}
          </li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-8 sm:mt-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-16 xl:gap-x-20">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <ProductGallery photos={photos} />
        </div>

        <div className="lg:pt-2">
          <Heading level={1} size="section">
            {product.title}
          </Heading>
          {summary && <p className="mt-3 text-lg leading-snug text-muted sm:text-xl">{summary}</p>}

          {price !== null && (
            <p className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">{formatMoney(price, { currency, locale })}</span>
              <span className="text-[0.9375rem] text-muted">{t('taxIncluded', { rate: formatTaxRate(displayTaxRate, locale) })}</span>
            </p>
          )}

          <ProductAvailability
            stock={stock}
            inventory={product.inventory}
            purchasable={price !== null && stock !== 'soldOut'}
            addToCart={addToCart}
            className={price !== null ? 'mt-3' : 'mt-6'}
          />

          <ProductFacts facts={product.facts} className="mt-10" />
          <ProductDescription data={product.description} locale={locale} className="mt-10" />
        </div>
      </div>
    </Container>
  )
}
