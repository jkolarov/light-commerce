// The Stripe.js the browser gets when the end-to-end test runs without Stripe (`E2E_STRIPE=stub`):
// the test serves it in place of https://js.stripe.com/v3 (../support/fixtures.ts). It has the
// part of Stripe.js the shop's checkout uses (src/modules/shop/payments/stripe/usePaymentElement.ts):
// `Stripe(key)`, `elements()`, a Payment Element drawn in an iframe with card number, expiry and
// CVC fields, `elements.submit()` and `confirmPayment()`. Confirming posts the client secret to
// the fake Stripe API (./server.ts), which marks the PaymentIntent paid and sends the webhook.
// Card 4242 4242 4242 4242 pays; any other number is declined, as in Stripe's test mode.

/** How the fake Payment Element's iframe is named, like Stripe's own, so one locator finds either. */
export type StubFrame = { name: string; title: string }

/** The script, ready to serve: `installFakeStripe` called with the stub's address. */
export function fakeStripeJs(apiBase: string, frame: StubFrame): string {
  return `(${installFakeStripe.toString()})(${JSON.stringify(apiBase)}, ${JSON.stringify(frame)});`
}

// Runs in the browser, from its source text: it may use nothing from outside its own body.
function installFakeStripe(apiBase: string, frame: StubFrame) {
  type Handler = () => void
  type StripeError = { type: string; message: string }

  const card = { number: '', expiry: '', cvc: '' }
  let iframe: HTMLIFrameElement | null = null

  const read = () => {
    const doc = iframe?.contentDocument
    for (const name of ['number', 'expiry', 'cvc'] as const) {
      card[name] = doc?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value.replace(/\s/g, '') ?? ''
    }
  }

  const fields = [
    ['number', 'Card number', 'cc-number'],
    ['expiry', 'Expiration date (MM / YY)', 'cc-exp'],
    ['cvc', 'Security code', 'cc-csc'],
  ]
    .map(([name, label, autocomplete]) => `<label>${label} <input name="${name}" autocomplete="${autocomplete}" inputmode="numeric"></label>`)
    .join('')

  function createElement() {
    const handlers: Record<string, Handler | undefined> = {}
    return {
      on(event: string, handler: Handler) {
        handlers[event] = handler
      },
      mount(node: HTMLElement) {
        iframe = document.createElement('iframe')
        iframe.name = frame.name
        iframe.title = frame.title
        iframe.style.cssText = 'width:100%;height:9rem;border:0'
        iframe.srcdoc = `<!doctype html><form style="display:grid;gap:.5rem;font:16px sans-serif">${fields}</form>`
        iframe.addEventListener('load', () => handlers.ready?.(), { once: true })
        node.append(iframe)
      },
      destroy() {
        iframe?.remove()
        iframe = null
      },
    }
  }

  const fakeStripe = () => ({
    _registerWrapper() {},
    elements() {
      return {
        create: () => createElement(),
        async submit(): Promise<{ error?: StripeError }> {
          read()
          if (!card.number || !card.expiry || !card.cvc) return { error: { type: 'validation_error', message: 'Your card details are incomplete.' } }
          return {}
        },
      }
    },
    async confirmPayment({ clientSecret }: { clientSecret: string }): Promise<{ error?: StripeError; paymentIntent?: { id: string; status: string } }> {
      read()
      if (card.number !== '4242424242424242') return { error: { type: 'card_error', message: 'Your card was declined.' } }
      const id = clientSecret.split('_secret_')[0]
      const response = await fetch(`${apiBase}/v1/payment_intents/${id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_secret: clientSecret }),
      })
      const body = (await response.json()) as { id: string; status: string; error?: { message: string } }
      if (!response.ok) return { error: { type: 'api_error', message: body.error?.message ?? 'The Stripe stub refused the payment.' } }
      return { paymentIntent: { id: body.id, status: body.status } }
    },
  })

  ;(window as unknown as { Stripe: typeof fakeStripe }).Stripe = fakeStripe
}
