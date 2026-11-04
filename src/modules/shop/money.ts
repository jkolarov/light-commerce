import type { Locale } from '@/core/i18n/locales'

/**
 * Formats an amount of money for display. Money is always a whole number of the currency's minor
 * unit (cents for EUR): `formatMoney(1250, { currency: 'EUR', locale: 'fr' })` is "12,50 €",
 * and "€12.50" in English. Throws on anything else, because a fractional amount is a bug upstream.
 */
export function formatMoney(cents: number, opts: { currency: string; locale: Locale }): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`Invalid amount ${String(cents)}: money is a whole number of cents`)
  }
  const format = new Intl.NumberFormat(opts.locale, { style: 'currency', currency: opts.currency })
  // The currency's minor unit: 2 decimals for EUR, 0 for JPY.
  const decimals = format.resolvedOptions().maximumFractionDigits ?? 2
  return format.format(cents / 10 ** decimals)
}
