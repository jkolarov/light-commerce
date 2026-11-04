import { getLightConfig } from '@/config'
import { isLocale } from '@/core/i18n/locales'

// Where the browser comes back after paying (Stripe's return URL). 404 when the shop is off.

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const { locales, modules } = getLightConfig()
  if (!isLocale(locale) || !locales.available.includes(locale) || !modules.shop) return new Response('Not found', { status: 404 })
  const { checkoutReturn } = await import('@/modules/shop/checkout/route')
  return checkoutReturn(request, locale)
}
