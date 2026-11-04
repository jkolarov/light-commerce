import { randomBytes } from 'node:crypto'

import { expect, test } from './support/fixtures'
import { paymentSucceededEvent, postWebhook } from './support/webhook'

// Stripe's webhook creates orders, so only Stripe may call it: the shop refuses a request whose
// `stripe-signature` doesn't check out (S18) with 400, before reading anything.

test('a webhook without a valid signature is refused and creates no order', async ({ owner, request }) => {
  const ordersBefore = await owner.orderCount()
  const event = paymentSucceededEvent({
    id: `pi_e2eforged${randomBytes(8).toString('hex')}`,
    amount: 1280,
    currency: 'eur',
    customer: 'cus_e2eforged',
    metadata: { cartID: '1' },
  })

  expect(await postWebhook(request, event, 'missing'), 'no signature').toBe(400)
  expect(await postWebhook(request, event, 'wrongSecret'), 'signed with another secret').toBe(400)
  expect(await postWebhook(request, event, 'tamperedBody'), 'the body changed after signing').toBe(400)
  // The same event, signed properly, gets past the check, and is ignored: the shop never started
  // this payment. So the 400s above come from the signature alone.
  expect(await postWebhook(request, event, 'valid'), 'signed properly').toBe(200)

  expect(await owner.orderCount()).toBe(ordersBefore)
})
