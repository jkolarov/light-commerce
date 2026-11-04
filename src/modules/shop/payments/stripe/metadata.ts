// What the plugin's Stripe adapter keeps in a PaymentIntent's metadata, and Stripe's limit on it.
// Pure: the checkout form uses the limit too. Re-check on every plugin upgrade: this mirrors
// `payments/adapters/stripe/initiatePayment.js` (`cartItemsSnapshot`, `shippingAddress`).

/** Stripe keeps at most 500 characters in one metadata value. */
export const STRIPE_METADATA_LIMIT = 500

type Line = { product?: unknown; variant?: unknown; quantity?: unknown; [key: string]: unknown }

const idOf = (value: unknown) => (value && typeof value === 'object' ? (value as { id?: unknown }).id : value)

/**
 * The cart's lines as the adapter writes them into `cartItemsSnapshot` (every property of a line,
 * the product and variant as ids), written as JSON. The plugin puts all the lines in this one
 * value, about 61 characters each, so a cart of more than about 8 lines can't be paid.
 */
export function lineSnapshot(items: readonly Line[]): string {
  return JSON.stringify(
    items.map(({ product, variant, ...rest }) => ({
      ...rest,
      product: idOf(product),
      quantity: rest.quantity,
      ...(variant ? { variant: idOf(variant) } : {}),
    })),
  )
}
