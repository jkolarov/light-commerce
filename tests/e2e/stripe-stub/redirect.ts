// Loaded into the app's dev server by the end-to-end test when it runs without Stripe
// (`E2E_STRIPE=stub`): `NODE_OPTIONS=--import=<this file>`, set only by playwright.config.ts.
// It sends the server's requests for api.stripe.com to the fake Stripe API (./server.ts) on
// 127.0.0.1:STRIPE_STUB_PORT. Nothing in the app changes: the ecommerce plugin's Stripe adapter,
// the shop's wrapper and Stripe's SDK all run as they do against Stripe.
//
// Stripe's Node SDK calls `https.request` on the `https` module object at request time, and says
// it does so on purpose, so test suites can intercept it (stripe/esm/net/NodeHttpClient.js).
// One file with only erasable TypeScript, so Node runs it as it is.
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'

const STRIPE_API_HOST = 'api.stripe.com'
const port = Number(process.env.STRIPE_STUB_PORT)
if (!port) throw new Error('tests/e2e/stripe-stub/redirect.ts needs STRIPE_STUB_PORT: the fake Stripe API it sends requests to.')

const passThrough = https.request

function toStub(this: unknown, ...args: Parameters<typeof https.request>): http.ClientRequest {
  const [first, second] = args
  const options = (typeof first === 'object' && !(first instanceof URL) ? first : null) as https.RequestOptions | null
  if (options?.host !== STRIPE_API_HOST && options?.hostname !== STRIPE_API_HOST) {
    return (passThrough as (...a: unknown[]) => http.ClientRequest).apply(this, args)
  }
  const callback = typeof second === 'function' ? second : undefined
  // Plain HTTP to the stub. The SDK's https.Agent can't carry it, so no agent (a new socket each time).
  const request = http.request(
    { host: '127.0.0.1', port, path: options.path, method: options.method, headers: options.headers, agent: false },
    callback,
  )
  // The SDK writes the body once the socket is secure ('secureConnect'), which a plain socket never
  // says. Registered before the SDK's own 'socket' listener, so the SDK still waits for it.
  request.once('socket', (socket) => socket.once('connect', () => socket.emit('secureConnect')))
  return request
}

https.request = toStub as typeof https.request
syncBuiltinESMExports()
