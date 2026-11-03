// Spike (FLU-10): log in to the admin, record the navigation, check hidden / read-only collections,
// and exercise the admin (used as the "admin use" load for the memory measurement).
// Usage: node scripts/spike-admin.mjs <baseURL> [screenshotDir]
import { chromium } from '@playwright/test'

const base = process.argv[2] || 'http://localhost:4100'
const shots = process.argv[3]
const email = process.env.SPIKE_ADMIN_EMAIL || 'admin@spike.local'
const password = process.env.SPIKE_ADMIN_PASSWORD || 'spike-admin-pw'
const out = {}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
page.setDefaultTimeout(90_000)

await page.goto(`${base}/admin/login`)
await page.locator('input[name="email"], #field-email').first().fill(email)
await page.locator('input[name="password"], #field-password').first().fill(password)
await page.getByRole('button', { name: /log ?in/i }).click()
await page.waitForURL((u) => !u.pathname.includes('/login'))
await page.waitForLoadState('networkidle')

out.navLinks = await page.$$eval('nav a[href^="/admin/"]', (as) =>
  [...new Set(as.map((a) => a.getAttribute('href')))].sort(),
)
if (shots) await page.screenshot({ path: `${shots}/admin-dashboard.png`, fullPage: true })

const visit = async (path) => {
  const res = await page.goto(`${base}${path}`)
  await page.waitForLoadState('networkidle')
  const text = await page.locator('body').innerText()
  return {
    status: res?.status(),
    notFound: /not found|404|nothing found/i.test(text),
    hasSave: (await page.getByRole('button', { name: /^save$/i }).count()) > 0,
    hasCreateNew: (await page.getByRole('link', { name: /create new/i }).count()) > 0,
  }
}

out.pages = {}
for (const path of process.env.SPIKE_SKIP_VISITS ? [] : [
  '/admin/collections/pages',
  '/admin/collections/products',
  '/admin/collections/products/1',
  '/admin/collections/orders',
  '/admin/collections/orders/1',
  '/admin/collections/media',
  '/admin/collections/users',
  '/admin/collections/users/1',
  '/admin/collections/transactions',
  '/admin/collections/transactions/1',
  '/admin/collections/carts',
  '/admin/collections/addresses',
  '/admin/collections/variants',
  '/admin/collections/variantTypes',
  '/admin/collections/variantOptions',
]) {
  out.pages[path] = await visit(path)
  if (shots && /transactions\/1|orders\/1|products\/1/.test(path)) {
    await page.screenshot({ path: `${shots}/admin${path.replaceAll('/', '_')}.png`, fullPage: true })
  }
}

// Optional write actions: upload a photo (sharp variants) and change stock in the product form.
if (process.env.SPIKE_UPLOAD_FILE) {
  const t = Date.now()
  await page.goto(`${base}/admin/collections/media/create`)
  await page.locator('input[type="file"]').first().setInputFiles(process.env.SPIKE_UPLOAD_FILE)
  await page.locator('#field-alt').fill('Spike photo')
  await page.getByRole('button', { name: /^save$/i }).click()
  await page.waitForURL(/\/admin\/collections\/media\/\d+/, { timeout: 120_000 })
  out.upload = { url: page.url(), seconds: (Date.now() - t) / 1000 }
  if (shots) await page.screenshot({ path: `${shots}/admin-media-uploaded.png`, fullPage: true })

  const t2 = Date.now()
  await page.goto(`${base}/admin/collections/products/1`)
  await page.getByRole('button', { name: 'Product Details' }).or(page.getByText('Product Details', { exact: true })).first().click()
  const inv = page.locator('#field-inventory')
  await inv.fill(String(30 + Math.floor(Math.random() * 60)))
  await page.getByRole('button', { name: /publish changes/i }).first().click()
  await page.waitForResponse((r) => r.url().includes('/api/products/1') || r.request().method() === 'POST')
  await page.waitForLoadState('networkidle')
  if (shots) await page.screenshot({ path: `${shots}/admin-product-stock-saved.png`, fullPage: true })
  out.stockEdit = { seconds: (Date.now() - t2) / 1000 }
}

// REST still works for hidden collections? (guest carts must keep working)
out.restCartsAsAdmin = (await page.request.get(`${base}/api/carts?limit=1`)).status()
await browser.close()
console.log(JSON.stringify(out, null, 1))
