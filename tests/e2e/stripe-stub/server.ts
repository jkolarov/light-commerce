// A fake Stripe API for the end-to-end test when it runs without Stripe (`E2E_STRIPE=stub`, the
// default in CI: the repo is public and CI has no Stripe keys). It plays Stripe and the Stripe CLI:
//
// - the part of Stripe's REST API that the ecommerce plugin's Stripe adapter and the shop call
//   (customers, PaymentIntents), reached through ./redirect.ts, which sends the server's requests
//   for api.stripe.com here;
// - the confirmation that Stripe.js does in the browser (./stripe-js.ts posts it here);
// - Stripe's webhook: after a confirmation it posts a signed `payment_intent.succeeded` to the
//   app, as `stripe listen` forwards it in a real run.
//
// Nothing here is part of the app. It keeps state in memory and serves 127.0.0.1 only. Run by
// Playwright (playwright.config.ts): `node tests/e2e/stripe-stub/server.ts`, with
// STRIPE_STUB_PORT, STRIPE_STUB_WEBHOOK_URL and STRIPE_WEBHOOKS_SIGNING_SECRET set.
// One file with only erasable TypeScript, so Node runs it as it is.
import { createHmac, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

type Metadata = Record<string, string>

type Customer = { id: string; object: 'customer'; email: string | null; created: number; livemode: false; metadata: Metadata }

type PaymentIntent = {
  id: string
  object: 'payment_intent'
  amount: number
  amount_received: number
  currency: string
  customer: string | null
  metadata: Metadata
  status: 'requires_payment_method' | 'succeeded'
  client_secret: string
  created: number
  livemode: false
  automatic_payment_methods: { enabled: boolean } | null
  payment_method_types: string[]
}

const port = Number(process.env.STRIPE_STUB_PORT)
const webhookUrl = process.env.STRIPE_STUB_WEBHOOK_URL ?? ''
const signingSecret = process.env.STRIPE_WEBHOOKS_SIGNING_SECRET ?? ''
if (!port || !webhookUrl || !signingSecret) {
  throw new Error('The Stripe stub needs STRIPE_STUB_PORT, STRIPE_STUB_WEBHOOK_URL and STRIPE_WEBHOOKS_SIGNING_SECRET.')
}

const customers = new Map<string, Customer>()
const paymentIntents = new Map<string, PaymentIntent>()

/** Letters and digits, like Stripe's IDs (the shop accepts `pi_` followed by those only). */
const token = (length: number) => randomBytes(length).toString('hex').slice(0, length)
const now = () => Math.floor(Date.now() / 1000)

/**
 * Stripe's form encoding, one level deep: `metadata[cartID]=1` becomes `{ metadata: { cartID: '1' } }`.
 * That is all the adapter sends.
 */
function parseForm(body: string): Record<string, string | Record<string, string>> {
  const result: Record<string, string | Record<string, string>> = {}
  for (const [key, value] of new URLSearchParams(body)) {
    const nested = /^([^[]+)\[([^\]]+)\]$/.exec(key)
    if (!nested) {
      result[key] = value
      continue
    }
    const [, outer, inner] = nested as unknown as [string, string, string]
    const group = result[outer]
    result[outer] = { ...(typeof group === 'object' ? group : {}), [inner]: value }
  }
  return result
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const group = (value: unknown): Record<string, string> => (value && typeof value === 'object' ? (value as Record<string, string>) : {})

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    // The browser's confirmation comes from the app's origin.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(body))
}

const notFound = (res: ServerResponse, what: string) =>
  send(res, 404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such ${what}` } })

/** Signs a webhook the way Stripe does: `t=<time>,v1=<HMAC-SHA256 of "<time>.<body>">`. */
function signature(body: string): string {
  const time = now()
  return `t=${time},v1=${createHmac('sha256', signingSecret).update(`${time}.${body}`).digest('hex')}`
}

/** Posts `payment_intent.succeeded` to the app, once, as Stripe would after a payment. */
async function deliverSucceeded(intent: PaymentIntent) {
  const event = {
    id: `evt_stub${token(20)}`,
    object: 'event',
    api_version: '2025-03-31.basil',
    created: now(),
    data: { object: intent },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'payment_intent.succeeded',
  }
  const body = JSON.stringify(event)
  try {
    const response = await fetch(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature(body) }, body })
    console.log(`[stripe-stub] webhook payment_intent.succeeded for ${intent.id}: ${response.status}`)
    if (!response.ok) console.error(`[stripe-stub] the app answered ${response.status}: ${await response.text()}`)
  } catch (error) {
    console.error(`[stripe-stub] could not deliver the webhook for ${intent.id}`, error)
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://stub')
  const method = req.method ?? 'GET'
  const route = `${method} ${url.pathname}`
  if (method === 'OPTIONS') return send(res, 204, null)
  if (route === 'GET /health') return send(res, 200, { ok: true })

  // stripe.customers.list({ email })
  if (route === 'GET /v1/customers') {
    const email = url.searchParams.get('email')
    const data = [...customers.values()].filter((customer) => !email || customer.email === email)
    return send(res, 200, { object: 'list', data, has_more: false, url: '/v1/customers' })
  }

  // stripe.customers.create({ email })
  if (route === 'POST /v1/customers') {
    const form = parseForm(await readBody(req))
    const customer: Customer = { id: `cus_stub${token(14)}`, object: 'customer', email: text(form.email) || null, created: now(), livemode: false, metadata: group(form.metadata) }
    customers.set(customer.id, customer)
    return send(res, 200, customer)
  }

  // stripe.paymentIntents.create({ amount, currency, customer, metadata, automatic_payment_methods })
  if (route === 'POST /v1/payment_intents') {
    const form = parseForm(await readBody(req))
    const amount = Number(text(form.amount))
    if (!Number.isInteger(amount) || amount <= 0) {
      return send(res, 400, { error: { type: 'invalid_request_error', param: 'amount', message: 'Invalid positive integer' } })
    }
    const id = `pi_stub${token(20)}`
    const intent: PaymentIntent = {
      id,
      object: 'payment_intent',
      amount,
      amount_received: 0,
      // Stripe answers in lowercase whatever case it was given.
      currency: text(form.currency).toLowerCase(),
      customer: text(form.customer) || null,
      metadata: group(form.metadata),
      status: 'requires_payment_method',
      client_secret: `${id}_secret_${token(24)}`,
      created: now(),
      livemode: false,
      automatic_payment_methods: group(form.automatic_payment_methods).enabled === 'true' ? { enabled: true } : null,
      payment_method_types: ['card'],
    }
    paymentIntents.set(id, intent)
    return send(res, 200, intent)
  }

  const intentRoute = /^\/v1\/payment_intents\/([A-Za-z0-9_]+)(\/confirm)?$/.exec(url.pathname)
  const intent = intentRoute ? paymentIntents.get(intentRoute[1]!) : undefined

  // stripe.paymentIntents.retrieve(id)
  if (intentRoute && !intentRoute[2] && method === 'GET') {
    return intent ? send(res, 200, intent) : notFound(res, `payment_intent: '${intentRoute[1]}'`)
  }

  // Stripe.js's confirmPayment, from the browser, with the client secret only (./stripe-js.ts).
  if (intentRoute?.[2] && method === 'POST') {
    if (!intent) return notFound(res, `payment_intent: '${intentRoute[1]}'`)
    const form = parseForm(await readBody(req))
    if (text(form.client_secret) !== intent.client_secret) {
      return send(res, 400, { error: { type: 'invalid_request_error', message: 'The client_secret does not match this PaymentIntent.' } })
    }
    const firstTime = intent.status !== 'succeeded'
    intent.status = 'succeeded'
    intent.amount_received = intent.amount
    send(res, 200, intent)
    // Stripe sends the event on its own, a moment later: it may reach the app before or after
    // the browser comes back, as in a real payment.
    if (firstTime) setImmediate(() => void deliverSucceeded(intent))
    return
  }

  // A call the stub doesn't know: the adapter (or the shop) started using more of Stripe's API.
  console.error(`[stripe-stub] no fake for ${route}: add it to tests/e2e/stripe-stub/server.ts`)
  return notFound(res, `route: ${route}`)
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error('[stripe-stub]', error)
    if (!res.headersSent) send(res, 500, { error: { type: 'api_error', message: 'The Stripe stub failed.' } })
  })
}).listen(port, '127.0.0.1', () => console.log(`[stripe-stub] fake Stripe API on http://127.0.0.1:${port}`))
