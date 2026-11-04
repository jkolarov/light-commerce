import { e2e } from './support/env'
import { expect, test } from './support/fixtures'
import { addToCartAndOpenCart, checkOut, moneyPattern, openProductFromHome, payWithTestCard, shopper } from './support/shop'
import { resendPaymentSucceeded } from './support/webhook'

// The path that matters most (S25): a visitor finds a product, puts it in the cart, pays with
// Stripe's test card, and the order exists, charged the stored price plus the flat shipping, with
// the stock down by one. Locally it pays in Stripe's test mode and the Stripe CLI forwards the
// webhook; in CI a fake Stripe stands in (tests/e2e/support/env.ts). Each run seeds its own
// database. The tests run one after the other and buy different products.

// PENDING: S18 (FLU-32) is not on main yet. It adds the order's access token and the confirmation
// page `/[locale]/order/[id]?token=`, sends the browser there after paying (until then it lands on
// "payment received", /[locale]/checkout/received), and makes Stripe's `payment_intent.succeeded`
// webhook create the order. Everything before each `test.fixme` below runs and must pass today;
// remove the two `test.fixme` lines once S18 is merged.
const WAITING_FOR_S18 = 'Waiting for S18 (FLU-32): the order confirmation page, and orders created from the webhook'

test('FR: from the home page to a paid order', async ({ page, owner, request }) => {
  const product = await owner.product('verveine-odorante')
  const name = 'Verveine odorante'
  const total = product.priceInEUR + e2e.shipping
  const who = shopper('fr')

  await test.step('browse to a product from /fr', () => openProductFromHome(page, 'fr', { slug: product.slug, name }))
  await test.step('add it to the cart and open the cart', () => addToCartAndOpenCart(page, 'fr', { name }, { subtotal: product.priceInEUR, total }))
  await test.step('check out with a shipping address', () => checkOut(page, 'fr', who, total))
  const paymentIntent = await test.step('pay with the test card', () => payWithTestCard(page, 'fr', total))
  // Until S18, the browser lands on "payment received".
  await expect(page).toHaveURL(/\/fr\/(?:order\/\d+\?token=.+|checkout\/received)$/)

  const order = await test.step('the order is in the admin: stored price plus shipping, stock down by one', async () => {
    await expect.poll(async () => (await owner.orders(who.email)).length).toBe(1)
    const [order] = await owner.orders(who.email)
    expect(order).toMatchObject({ amount: total, currency: 'EUR', items: [{ product: product.id, quantity: 1 }] })
    const [transaction] = await owner.transactions(who.email)
    expect(transaction).toMatchObject({
      status: 'succeeded',
      amount: total,
      subtotal: product.priceInEUR,
      shippingAmount: e2e.shipping,
      stripe: { paymentIntentID: paymentIntent },
    })
    expect((await owner.product(product.slug)).inventory).toBe(product.inventory - 1)
    return order!
  })

  await test.step('Stripe sends the webhook again: still one order, stock down once', async () => {
    const [transaction] = await owner.transactions(who.email)
    expect(await resendPaymentSucceeded(request, transaction!)).toBe(200)
    expect(await owner.orders(who.email)).toHaveLength(1)
    expect((await owner.product(product.slug)).inventory).toBe(product.inventory - 1)
  })

  test.fixme(true, WAITING_FOR_S18)
  await test.step('the confirmation page shows the order', async () => {
    await expect(page).toHaveURL(new RegExp(`/fr/order/${order.id}\\?token=`))
    const main = page.getByRole('main')
    await expect(main).toContainText('Merci')
    await expect(main).toContainText(String(order.id))
    await expect(main).toContainText(moneyPattern(total, 'fr'))
  })
})

test('EN: the tab closes after paying, the webhook creates the order', async ({ page, owner }) => {
  const product = await owner.product('tilleul')
  const name = 'Linden blossom'
  const total = product.priceInEUR + e2e.shipping
  const who = shopper('en')

  await test.step('browse to a product from /en', () => openProductFromHome(page, 'en', { slug: product.slug, name }))
  await test.step('add it to the cart and open the cart', () => addToCartAndOpenCart(page, 'en', { name }, { subtotal: product.priceInEUR, total }))
  await test.step('check out with a shipping address', () => checkOut(page, 'en', who, total))
  // The browser never reaches the shop's return path, as when the tab closes right after paying:
  // only Stripe's webhook can create the order.
  const returnPath = (url: URL) => url.pathname === '/en/checkout/return'
  await page.route(returnPath, (route) => route.abort())
  const paymentIntent = await test.step('pay with the test card', () => payWithTestCard(page, 'en', total))

  test.fixme(true, WAITING_FOR_S18)
  const order = await test.step('the webhook alone creates the order: stored price plus shipping, stock down by one', async () => {
    await expect.poll(async () => (await owner.orders(who.email)).length, { timeout: 60_000 }).toBe(1)
    const [order] = await owner.orders(who.email)
    expect(order).toMatchObject({ amount: total, currency: 'EUR', items: [{ product: product.id, quantity: 1 }] })
    expect((await owner.product(product.slug)).inventory).toBe(product.inventory - 1)
    return order!
  })

  await test.step('the visitor comes back later: the confirmation page, still one order', async () => {
    await page.unroute(returnPath)
    await page.goto(`/en/checkout/return?payment_intent=${paymentIntent}`)
    await expect(page).toHaveURL(new RegExp(`/en/order/${order.id}\\?token=`))
    const main = page.getByRole('main')
    await expect(main).toContainText('Thank you')
    await expect(main).toContainText(String(order.id))
    await expect(main).toContainText(moneyPattern(total, 'en'))
    expect(await owner.orders(who.email)).toHaveLength(1)
    expect((await owner.product(product.slug)).inventory).toBe(product.inventory - 1)
  })
})
