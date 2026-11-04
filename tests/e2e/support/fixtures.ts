import { test as base } from '@playwright/test'

import { fakeStripeJs } from '../stripe-stub/stripe-js'
import { ownerApi, type OwnerApi } from './admin'
import { e2e } from './env'
import { STRIPE_FRAME } from './shop'

/** Stripe's addresses, every subdomain: js.stripe.com, api.stripe.com, m.stripe.network, ... */
const STRIPE_URL = /^https:\/\/(?:[\w-]+\.)*stripe\.(?:com|network)(?:[/:?#]|$)/
/** The Stripe.js script the shop loads (@stripe/stripe-js). */
const STRIPE_JS_URL = /^https:\/\/js\.stripe\.com\/v3\/?(?:\?.*)?$/

// Fixtures call their second argument `provide` (Playwright's examples say `use`, which React's
// hooks lint rule takes for React's `use`).
export const test = base.extend<{ fakeStripeInBrowser: void; owner: OwnerApi }>({
  // Stub runs: the browser gets the fake Stripe.js, and nothing of Stripe's loads.
  fakeStripeInBrowser: [
    async ({ context }, provide) => {
      if (e2e.mode === 'stub') {
        // Routes run last registered first: the script, then the rest of Stripe refused.
        await context.route(STRIPE_URL, (route) => route.abort('blockedbyclient'))
        await context.route(STRIPE_JS_URL, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeStripeJs(e2e.stubURL, STRIPE_FRAME) }))
      }
      await provide()
    },
    { auto: true },
  ],
  owner: async ({ playwright }, provide) => {
    const api = await ownerApi(playwright)
    await provide(api)
    await api.dispose()
  },
})

export { expect } from '@playwright/test'
