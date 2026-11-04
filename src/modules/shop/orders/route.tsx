import config from '@payload-config'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'

import { loadOrderForGuest } from './load'
import { OrderView } from './OrderView'

// The order's confirmation page: `src/app/(frontend)/[locale]/order/[id]/page.tsx` is a thin
// wrapper around these. `/fr/order/12?token=…`: without the order's own token, the same 404 as a
// missing order, so nobody learns which order numbers exist.

/** The confirmation page of order `id`, for the holder of its `token`; 404 otherwise. */
export async function OrderPage({ locale, id, token }: { locale: Locale; id: string; token: unknown }) {
  const order = await loadOrderForGuest(await getPayload({ config }), { id, token, locale })
  if (!order) notFound()
  return <OrderView order={order} locale={locale} contactEmail={getLightConfig().site.contactEmail} />
}

/**
 * "Order confirmation", out of search engines. The token is in the address: no referrer to other
 * sites, so it never leaves in a link's `Referer`.
 */
export async function orderMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'order' })
  return { title: t('title'), robots: { index: false, follow: false }, referrer: 'same-origin' }
}
