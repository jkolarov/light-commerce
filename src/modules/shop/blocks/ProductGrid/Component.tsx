import config from '@payload-config'
import { getPayload } from 'payload'

import type { Locale } from '@/core/i18n/locales'
import type { ProductGridBlock as ProductGridBlockData } from '@/payload-types'
import { Container, Heading } from '@/theme'

import { ProductCard } from '../../components/ProductCard'
import { gridClasses } from './columns'
import { findGridProducts } from './load'

type Props = ProductGridBlockData & { locale: Locale }

/**
 * Products on a CMS page: an optional h2, then the shop page's cards (two columns on phones; two, three or
 * four from wide screens, chosen by card count in ./columns.ts). Sold-out products show "Épuisé" on their card, as on the shop page; products
 * that are not published are not there. With nothing to show, the block renders nothing.
 */
export async function ProductGridBlock({ heading, mode, count, products, locale }: Props) {
  const found = await findGridProducts(await getPayload({ config }), locale, { mode, count, products })
  if (found.length === 0) return null
  const title = heading?.trim()
  return (
    <section className="py-10 sm:py-14 lg:py-16">
      <Container>
        {title && <Heading level={2}>{title}</Heading>}
        <ul className={`${title ? 'mt-8 sm:mt-10 ' : ''}${gridClasses(found.length)}`}>
          {found.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} locale={locale} headingLevel={title ? 3 : 2} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}
