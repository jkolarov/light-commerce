import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import { cache } from 'react'

import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import { asMedia, shareImage } from '@/theme/media'
import { pageTitle, titleText } from '@/theme/title'

import { currentCart, quantityInCart } from '../cart/current'
import { addableQuantity } from '../cart/rules'
import { AddToCart } from '../components/AddToCart'
import { ProductDetails } from '../components/ProductDetails'
import { shopConfig } from '../config'
import { findPublishedLocales, findPublishedProduct } from './load'
import { productPath, shopPath } from './paths'
import { productPrice } from './price'

// The shop's routes. `src/app/(frontend)/[locale]/shop/page.tsx` and `shop/[slug]/page.tsx` are
// thin wrappers around these. Everything reads Payload at request time: nothing here is built
// statically (the build runs against an empty database).

// Cached per request: `generateMetadata` and the page both read the product.
const loadProduct = cache(async (locale: Locale, slug: string) => findPublishedProduct(await getPayload({ config }), locale, slug))

/** The product page, or 404 for a product that is unknown, not published or in the trash. */
export async function ProductPage({ locale, slug }: { locale: Locale; slug: string }) {
  const product = await loadProduct(locale, slug)
  if (!product) notFound()
  const { currency } = shopConfig()
  const price = productPrice(product, currency)
  const inCart = quantityInCart(await currentCart(locale), product.id)
  // ProductDetails draws it only for a product that can be bought (a price, some stock).
  const addToCart =
    price === null ? null : (
      <AddToCart
        productId={product.id}
        name={product.title ?? ''}
        unitPrice={price}
        currency={currency}
        locale={locale}
        addable={addableQuantity(product, inCart)}
        inCart={inCart}
      />
    )
  // No <main> here: the locale layout draws the page's one <main> around every route.
  return <ProductDetails product={product} locale={locale} addToCart={addToCart} />
}

function absolute(path: string): string {
  return new URL(path, getLightConfig().site.url).toString()
}

/** The page's address in this language (canonical) and in each of `locales` (`hreflang`). */
function alternates(locale: Locale, path: (locale: Locale) => string, locales: readonly Locale[] = getLightConfig().locales.available) {
  const languages = Object.fromEntries(locales.map((l) => [l, absolute(path(l))]))
  return { canonical: absolute(path(locale)), languages }
}

/**
 * Title (the name), description (the summary), share image (`og`) and `hreflang` alternates for
 * the languages the product is published in.
 */
export async function productMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const product = await loadProduct(locale, slug)
  if (!product) return {}
  const locales = await findPublishedLocales(await getPayload({ config }), product.id, getLightConfig().locales.available)
  const title = pageTitle(product.title, getLightConfig().site.name)
  const description = product.summary?.trim() || undefined
  const photo = asMedia(product.images?.[0])
  const image = photo ? shareImage(photo) : undefined
  const links = alternates(locale, (l) => productPath(l, product.slug), locales)
  return {
    title,
    description,
    alternates: links,
    openGraph: {
      type: 'website',
      title: titleText(title),
      description,
      url: links.canonical,
      locale,
      images: image ? [{ ...image, url: absolute(image.url) }] : undefined,
    },
  }
}

/** The product list's title and `hreflang` alternates. */
export async function shopMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'shop' })
  const links = alternates(locale, shopPath)
  const title = pageTitle(t('title'), getLightConfig().site.name)
  return { title, alternates: links, openGraph: { type: 'website', title: titleText(title), url: links.canonical, locale } }
}
