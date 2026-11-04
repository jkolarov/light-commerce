import type { Payload } from 'payload'

import type { Order } from '@/payload-types'

import { afterResponse } from '../emails/afterResponse'
import { sendOrderEmails } from '../emails/send'

/**
 * The seam for what follows a paid order. `finalizePayment` calls it every time it returns an
 * order: on the call that created it, and on every later one (a webhook retried, the browser and
 * the webhook both arriving, a reload of the return path, the reconcile job). So it runs outside
 * the settlement (the plugin's `confirm-order` has finished, and the order, the cart and the stock
 * are written), and it may run more than once for one order: whatever it does once per order must
 * claim the order atomically first. A throw here is logged by `finalizePayment` and never undoes
 * the order.
 *
 * S19: the order emails (the buyer's confirmation, the owner's notification). During a request
 * they go out after the response, so neither the buyer's page nor Stripe's webhook waits for the
 * mail server; in a script they are sent before this returns. `sendOrderEmails` claims the order
 * (`orders.confirmationEmailSentAt`) before sending, so they go out once, and never throws.
 */
export async function onOrderFinalized(payload: Payload, order: Order): Promise<void> {
  await afterResponse(() => sendOrderEmails(payload, order.id))
}
