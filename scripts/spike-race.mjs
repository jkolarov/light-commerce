// Spike (FLU-10): race N concurrent confirm-order calls (plus the webhook) on one payment.
// Payment confirmed server-side with Stripe's test method pm_card_visa (no browser).
// Usage: node --env-file=.env scripts/spike-race.mjs <baseURL> <concurrency>
import Stripe from 'stripe'

const base = process.argv[2] || 'http://localhost:4100'
const n = Number(process.argv[3] || 6)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const email = `race+${Date.now()}@spike.local`
const post = async (path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const cart = await post('/api/carts', { currency: 'EUR', items: [{ product: 1, quantity: 1 }] })
const cartID = cart.body.doc?.id
const secret = cart.body.doc?.secret
const address = { firstName: 'Race', lastName: 'Test', addressLine1: '1 rue', city: 'Paris', postalCode: '75002', country: 'FR' }
const init = await post('/api/payments/stripe/initiate', {
  cartID, secret, customerEmail: email, billingAddress: address, shippingAddress: address,
})
const pi = init.body.paymentIntentID
await stripe.paymentIntents.confirm(pi, { payment_method: 'pm_card_visa', return_url: `${base}/checkout` })

const results = await Promise.all(
  Array.from({ length: n }, () =>
    post('/api/payments/stripe/confirm-order', { paymentIntentID: pi, cartID, secret, customerEmail: email }),
  ),
)
console.log(
  JSON.stringify({
    cart: { status: cart.status, id: cartID, subtotal: cart.body.doc?.subtotal },
    initiate: { status: init.status, pi, amount: (await stripe.paymentIntents.retrieve(pi)).amount },
    confirms: results.map((r) => ({ status: r.status, orderID: r.body.orderID, message: r.body.message })),
  }),
)
