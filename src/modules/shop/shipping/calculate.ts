import type { ShopConfig } from '@/config'

export type ShippingQuote = { method: 'flat'; amount: number }

/**
 * Shipping cost in integer cents. Phase 1 has one rule: an empty order ships for 0, any other
 * order pays `shipping.flatRate`. Other methods (weight, pickup) become new members of the
 * `method` union later.
 */
export function calculateShipping(
  input: { subtotal: number },
  shipping: ShopConfig['shipping'],
): ShippingQuote {
  const { subtotal } = input
  if (typeof subtotal !== 'number' || !Number.isInteger(subtotal) || subtotal < 0) {
    throw new Error(
      `Invalid subtotal ${String(subtotal)}: expected a whole number of cents, 0 or more`,
    )
  }
  return { method: 'flat', amount: subtotal === 0 ? 0 : shipping.flatRate }
}

/** Whether the shop ships to this country (ISO 3166-1 alpha-2, capitals, exact match). */
export function isShippingCountry(code: string, shipping: ShopConfig['shipping']): boolean {
  return shipping.countries.includes(code)
}
