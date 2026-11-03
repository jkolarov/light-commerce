// Spike (FLU-10): drive a guest checkout with Stripe's embedded Payment Element.
// Usage: node scripts/spike-checkout.mjs <baseURL> <mode>
//   mode = browser   : normal flow, the browser calls confirm-order
//   mode = no-return : the browser pays with Stripe but its confirm-order call is dropped
//                      (as if the tab was closed right after paying); only the webhook can create the order
import { chromium } from '@playwright/test'

const base = process.argv[2] || 'http://localhost:4100'
const mode = process.argv[3] || 'browser'
const email = `guest+${Date.now()}@spike.local`
const result = { mode, email }

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(60_000)

page.on('response', async (res) => {
  const url = res.url()
  if (url.includes('/api/payments/stripe/initiate')) {
    try {
      const body = await res.json()
      result.initiateStatus = res.status()
      result.paymentIntentID = body.paymentIntentID
    } catch {}
  }
  if (url.includes('/api/payments/stripe/confirm-order')) {
    try {
      result.confirmStatus = res.status()
      result.confirmBody = await res.json()
    } catch {}
  }
})

if (mode === 'no-return') {
  await page.route('**/api/payments/stripe/confirm-order', (route) => {
    result.confirmDropped = true
    return route.abort()
  })
}

const t0 = Date.now()
await page.goto(`${base}/products/honey-jar`)
await page.getByRole('button', { name: 'Add to cart' }).click()
await page.waitForResponse((r) => r.url().includes('/api/carts') && r.request().method() !== 'GET')
await page.waitForTimeout(500)

await page.goto(`${base}/checkout`)
await page.locator('#email').fill(email)
await page.getByRole('button', { name: 'Continue as guest' }).click()

await page.getByRole('button', { name: 'Add a new address' }).click()
const dialog = page.getByRole('dialog')
await dialog.locator('#firstName').fill('Ada')
await dialog.locator('#lastName').fill('Guest')
await dialog.locator('#addressLine1').fill('1 rue de la Paix')
await dialog.locator('#city').fill('Paris')
await dialog.locator('#postalCode').fill('75002')
await dialog.locator('#country').click()
await page.getByRole('option', { name: 'France' }).click()
await dialog.getByRole('button', { name: 'Submit' }).click()

await page.getByRole('button', { name: 'Go to payment' }).click()

// Stripe Payment Element: card fields live in Stripe's iframe.
const frame = page.frameLocator('iframe[title="Secure payment input frame"]').first()
await frame.locator('input[name="number"]').fill('4242 4242 4242 4242')
await frame.locator('input[name="expiry"]').fill('12 / 34')
await frame.locator('input[name="cvc"]').fill('123')
const postal = frame.locator('input[name="postalCode"]')
if (await postal.count()) await postal.fill('75002')

await page.getByRole('button', { name: 'Pay now' }).click()

if (mode === 'browser') {
  await page.waitForURL(/\/orders\//, { timeout: 90_000 })
  result.orderURL = page.url().replace(/accessToken=[^&]+/, 'accessToken=<redacted>')
} else {
  // Wait until Stripe has confirmed the payment and our confirm-order call was dropped.
  const deadline = Date.now() + 90_000
  while (!result.confirmDropped && Date.now() < deadline) await page.waitForTimeout(250)
}
result.seconds = (Date.now() - t0) / 1000
await browser.close()
console.log(JSON.stringify(result))
