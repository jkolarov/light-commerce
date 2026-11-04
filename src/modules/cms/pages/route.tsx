import config from '@payload-config'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import { locales } from '@/core/i18n/locales'
import type { Media } from '@/payload-types'

import { pagePath } from '../fields/link'
import { RenderBlocks, type BlockComponents } from '../components/RenderBlocks'
import { lookupPage, pageSlugs } from './resolve'

// The CMS page route. `src/app/(frontend)/[locale]/page.tsx` (slug `home`) and `[...slug]/page.tsx`
// are thin wrappers around these two functions. Both read Payload at request time: nothing here is
// built statically (the build runs against an empty database).

async function load(locale: Locale, slug: string) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  const result = await lookupPage({ payload, locale, slug, user })
  return { payload, user, result }
}

/** Renders the page, redirects to this language's slug, or answers 404. */
export async function CmsPage(props: { locale: Locale; slug: string; components: BlockComponents }) {
  const { result } = await load(props.locale, props.slug)
  if (result.kind === 'redirect') redirect(result.to)
  if (result.kind === 'notFound') notFound()
  const { page } = result
  return (
    <main>
      <RenderBlocks blocks={page.layout} components={props.components} locale={props.locale} />
    </main>
  )
}

function absolute(path: string): string {
  return new URL(path, getLightConfig().site.url).toString()
}

function imageUrl(image: number | Media | null | undefined) {
  if (!image || typeof image !== 'object') return undefined
  const media = image as Media
  const url = media.variants?.og?.url ?? media.url
  return url ? absolute(url) : undefined
}

/** Title, description, share image and `hreflang` alternates from the page's SEO fields. */
export async function cmsPageMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const { payload, user, result } = await load(locale, slug)
  if (result.kind !== 'page') return {}
  const { page } = result
  const slugs = await pageSlugs({ payload, user, id: page.id })
  const languages = Object.fromEntries(locales.map((l) => [l, absolute(pagePath(slugs[l], l))]))
  const title = page.meta?.title || page.title || undefined
  const description = page.meta?.description || undefined
  const image = imageUrl(page.meta?.image)
  return {
    title,
    description,
    alternates: { canonical: languages[locale], languages },
    openGraph: { title, description, url: languages[locale], locale, images: image ? [image] : undefined },
  }
}
