import config from '@payload-config'
import { getPayload } from 'payload'

import type { Locale } from '@/core/i18n/locales'

import { findPublishedProducts } from '../products/load'
import { ProductGrid } from './ProductGrid'

export type ProductListProps = { locale: Locale }

/**
 * The published products for one locale, as the shop page (`/<locale>/shop`), and as the home
 * page when the CMS is off. Reads Payload at request time.
 */
export async function ProductList({ locale }: ProductListProps) {
  const products = await findPublishedProducts(await getPayload({ config }), locale)
  return <ProductGrid products={products} locale={locale} />
}
