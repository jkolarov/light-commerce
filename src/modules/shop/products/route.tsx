import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import { cache } from 'react'

import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import { asMedia, shareImage } from '@/theme/media'

import { ProductDetails } from '../components/ProductDetails'
import { findPublishedLocales, findPublishedProduct } from './load'
import { productPath, shopPath } from './paths'

// The shop's routes. `src/app/(frontend)/[locale]/shop/page.tsx` and `shop/[slug]/page.tsx` are
// thin wrappers around these. Everything reads Payload at request time: nothing here is built
// statically (the build runs against an empty database).

// Cached per request: `generateMetadata` and the page both read the product.
const loadProduct = cache(async (locale: Locale, slug: string) => findPublishedProduct(await getPayload({ config }), locale, slug))

/** The product page, or 404 for a product that is unknown, not published or in the trash. */
export async function ProductPage({ locale, slug }: { locale: Locale; slug: string }) {
  const product = await loadProduct(locale, slug)
  if (!product) notFound()
  // No <main> here: the locale layout draws the page's one <main> around every route.
  return <ProductDetails product={product} locale={locale} />
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
  const title = product.title?.trim() || undefined
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
      title,
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
  return { title: t('title'), alternates: links, openGraph: { type: 'website', title: t('title'), url: links.canonical, locale } }
}
