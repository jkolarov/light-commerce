import type { Payload } from 'payload'

import type { Order } from '@/payload-types'

/**
 * The seam for what follows a paid order (S19: the order emails). `finalizePayment` calls it every
 * time it returns an order: on the call that created it, and on every later one (a webhook
 * retried, the browser and the webhook both arriving, a reload of the return path). So it runs
 * outside the settlement (the plugin's `confirm-order` has finished, and the order, the cart and
 * the stock are written), and it may run more than once for one order: whatever it does once per
 * order must claim the order atomically first, as the plan says for
 * `orders.confirmationEmailSentAt` (`payload.db.updateOne(..., { options: { atomic: true } })`).
 * A throw here is logged by `finalizePayment` and never undoes the order.
 */
export async function onOrderFinalized(_payload: Payload, _order: Order): Promise<void> {
  // S19 sends the order confirmation and the owner's notification from here.
}
