import { useTranslations } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'
import { Container, Heading } from '@/theme'

import { shopConfig } from '../config'
import { formatTaxRate } from '../products/price'
import { ProductCard, type ProductCardProduct } from './ProductCard'

type Props = {
  /** The published products, in the order to show them. */
  products: (ProductCardProduct & { id: number })[]
  locale: Locale
}

/**
 * The shop page: its heading, a line saying prices include VAT, and a grid of product cards (two
 * columns on phones, three from wide screens). A small catalogue needs no filters (design notes,
 * "Product list").
 */
export function ProductGrid({ products, locale }: Props) {
  const t = useTranslations('shop')
  const { displayTaxRate } = shopConfig()
  return (
    <Container className="pt-10 pb-16 sm:pt-16 sm:pb-24 lg:pt-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
        <Heading level={1}>{t('title')}</Heading>
        {products.length > 0 && (
          <p className="text-[0.9375rem] text-muted sm:pb-2 sm:text-base">{t('pricesIncludeTax', { rate: formatTaxRate(displayTaxRate, locale) })}</p>
        )}
      </div>
      {products.length > 0 ? (
        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:mt-14 sm:gap-x-6 sm:gap-y-12 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-16">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} locale={locale} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 max-w-[46ch] text-lg text-muted">{t('noProducts')}</p>
      )}
    </Container>
  )
}
