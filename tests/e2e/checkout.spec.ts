import { e2e } from './support/env'
import { expect, test } from './support/fixtures'
import {
  addToCartAndOpenCart,
  checkOut,
  expectConfirmationPage,
  openProductFromHome,
  orderIdFromConfirmationPage,
  payWithTestCard,
  shopper,
} from './support/shop'
import { resendPaymentSucceeded } from './support/webhook'

// The path that matters most (S25): a visitor finds a product, puts it in the cart, pays with
// Stripe's test card, and the order exists, charged the stored price plus the flat shipping, with
// the stock down by one. Locally it pays in Stripe's test mode and the Stripe CLI forwards the
// webhook; in CI a fake Stripe stands in (tests/e2e/support/env.ts). Each run seeds its own
// database. The tests run one after the other and buy different products.

test('FR: from the home page to a paid order', async ({ page, owner, request }) => {
  const product = await owner.product('verveine-odorante')
  const name = 'Verveine odorante'
  const total = product.priceInEUR + e2e.shipping
  const who = shopper('fr')

  await test.step('browse to a product from /fr', () => openProductFromHome(page, 'fr', { slug: product.slug, name }))
  await test.step('add it to the cart and open the cart', () => addToCartAndOpenCart(page, 'fr', { name }, { subtotal: product.priceInEUR, total }))
  await test.step('check out with a shipping address', () => checkOut(page, 'fr', who, total))
  const paymentIntent = await test.step('pay with the test card', () => payWithTestCard(page, 'fr', total))

  // The browser's return and Stripe's webhook race to settle the payment; either way the browser
  // lands on the order's page (the return waits for a webhook that is settling it).
  const orderId = await test.step('the confirmation page shows the order', async () => {
    const id = await orderIdFromConfirmationPage(page, 'fr')
    await expectConfirmationPage(page, 'fr', { id, total })
    return id
  })

  await test.step('the order is in the admin: stored price plus shipping, stock down by one', async () => {
    const orders = await owner.orders(who.email)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({
      id: orderId,
      amount: total,
      subtotal: product.priceInEUR,
      shippingAmount: e2e.shipping,
      currency: 'EUR',
      items: [{ product: product.id, quantity: 1 }],
    })
    expect(orders[0]!.needsAttention).toBeFalsy()
    const [transaction] = await owner.transactions(who.email)
    expect(transaction).toMatchObject({ status: 'succeeded', amount: total, order: orderId, stripe: { paymentIntentID: paymentIntent } })
    expect((await owner.product(product.slug)).inventory).toBe(product.inventory - 1)
  })

  await test.step('Stripe sends the webhook again: still one order, stock down once', async () => {
    const [transaction] = await owner.transactions(who.email)
    expect(await resendPaymentSucceeded(request, transaction!)).toBe(200)
    expect(await owner.orders(who.email)).toHaveLength(1)
    expect((await owner.product(product.slug)).inventory).toBe(product.inventory - 1)
  })
})

test('EN: the tab closes after paying, the webhook creates the order', async ({ page, owner, request }) => {
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

  const orderId = await test.step('the webhook alone creates the order: stored price plus shipping, stock down by one', async () => {
    await expect.poll(async () => (await owner.orders(who.email)).length, { timeout: 60_000 }).toBe(1)
    const [order] = await owner.orders(who.email)
    expect(order).toMatchObject({
      amount: total,
      subtotal: product.priceInEUR,
      shippingAmount: e2e.shipping,
      currency: 'EUR',
      items: [{ product: product.id, quantity: 1 }],
    })
    const [transaction] = await owner.transactions(who.email)
    expect(transaction).toMatchObject({ status: 'succeeded', amount: total, order: order!.id, stripe: { paymentIntentID: paymentIntent } })
    expect((await owner.product(product.slug)).inventory).toBe(product.inventory - 1)
    return order!.id
  })

  await test.step('the visitor comes back later: the confirmation page with its token, still one order', async () => {
    await page.unroute(returnPath)
    await page.goto(`/en/checkout/return?payment_intent=${paymentIntent}`)
    await expectConfirmationPage(page, 'en', { id: orderId, total })
    // Without the order's token, the page is not found (Review focus #4).
    expect((await request.get(`/en/order/${orderId}`)).status()).toBe(404)
    expect((await request.get(`/en/order/${orderId}?token=not-the-token`)).status()).toBe(404)
    expect(await owner.orders(who.email)).toHaveLength(1)
    expect((await owner.product(product.slug)).inventory).toBe(product.inventory - 1)
  })
})
