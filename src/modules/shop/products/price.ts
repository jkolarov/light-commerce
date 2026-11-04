import type { ShopConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import type { Product } from '@/payload-types'

type Currency = ShopConfig['currency']

/** The price fields the ecommerce plugin adds for a currency: `priceInEUR` and its switch. */
export type PriceFields = Partial<Pick<Product, `priceIn${Currency}` | `priceIn${Currency}Enabled`>>

/**
 * The product's price in cents, or `null` when it has none: the price is switched off, empty or 0.
 * The ecommerce plugin refuses to sell a product without a price (0 included), so the shop shows
 * no price and no add-to-cart for it.
 */
export function productPrice(product: PriceFields, currency: Currency = 'EUR'): number | null {
  if (product[`priceIn${currency}Enabled`] === false) return null
  const price = product[`priceIn${currency}`]
  return typeof price === 'number' && price > 0 ? price : null
}

/** The display tax rate (`shop.displayTaxRate`, a percentage) in the locale: 5.5 is "5,5" in French. */
export function formatTaxRate(rate: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rate)
}
