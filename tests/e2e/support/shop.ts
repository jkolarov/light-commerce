import { expect, type Page } from '@playwright/test'

// The visitor's steps through the shop, in either language. The words are the site's own, from
// messages/{fr,en}.json and the demo's products (demo/content/products.json).

export type Locale = 'fr' | 'en'

const words = {
  fr: {
    addToCart: 'Ajouter au panier',
    added: 'Ajouté au panier',
    viewCart: 'Voir le panier',
    checkout: 'Commander',
    email: 'E-mail',
    firstName: 'Prénom',
    lastName: 'Nom',
    address: 'Adresse',
    postalCode: 'Code postal',
    city: 'Ville',
    pay: 'Payer',
  },
  en: {
    addToCart: 'Add to cart',
    added: 'Added to your cart',
    viewCart: 'View cart',
    checkout: 'Checkout',
    email: 'Email',
    firstName: 'First name',
    lastName: 'Last name',
    address: 'Address',
    postalCode: 'Postal code',
    city: 'City',
    pay: 'Pay',
  },
} satisfies Record<Locale, Record<string, string>>

/** An amount as the site writes it: "12,80 €" in French, "€12.80" in English. */
export const money = (cents: number, locale: Locale) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100)

/** The same as a pattern, whichever no-break space the page puts before "€". */
export const moneyPattern = (cents: number, locale: Locale) =>
  new RegExp(money(cents, locale).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s'))

/**
 * Stripe's Payment Element draws the card fields in its own iframe: of Stripe's
 * `__privateStripeFrame…` iframes, the one with a title (in the page's language). The stub's iframe
 * is named alike (tests/e2e/stripe-stub/stripe-js.ts), so one locator finds either.
 */
export const STRIPE_FRAME = { name: '__privateStripeFrame-e2e-stub', title: 'Secure payment input frame' }
const cardFrame = (page: Page) => page.frameLocator('iframe[name^="__privateStripeFrame"][title]')

export type Shopper = { email: string; firstName: string; lastName: string; address: string; postalCode: string; city: string }

/** A guest with an address the shop delivers to (France). The email is new on every run. */
export const shopper = (label: string): Shopper => ({
  email: `e2e-${label}-${Date.now()}@example.com`,
  firstName: 'Camille',
  lastName: 'Martin',
  address: '12 rue des Lilas',
  postalCode: '26110',
  city: 'Nyons',
})

/** From the home page to a product's page, through the home page's product grid. */
export async function openProductFromHome(page: Page, locale: Locale, product: { slug: string; name: string }) {
  await page.goto(`/${locale}`)
  await page.getByRole('main').getByRole('link', { name: product.name, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/${locale}/shop/${product.slug}$`))
  await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible()
}

/** Adds one to the cart (the drawer opens and says so), then opens the cart page from the drawer. */
export async function addToCartAndOpenCart(page: Page, locale: Locale, product: { name: string }, totals: { subtotal: number; total: number }) {
  const t = words[locale]
  await page.getByRole('button', { name: new RegExp(`^${t.addToCart}`) }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('status').filter({ hasText: t.added })).toContainText(`${product.name} × 1`)
  await drawer.getByRole('link', { name: t.viewCart }).click()
  await expect(page).toHaveURL(new RegExp(`/${locale}/cart$`))
  const cart = page.getByRole('main')
  await expect(cart).toContainText(product.name)
  await expect(cart).toContainText(moneyPattern(totals.subtotal, locale))
  await expect(cart).toContainText(moneyPattern(totals.total, locale))
}

/** From the cart page to the checkout, then the contact details and the shipping address. */
export async function checkOut(page: Page, locale: Locale, who: Shopper, total: number) {
  const t = words[locale]
  await page.getByRole('main').getByRole('link', { name: t.checkout, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/${locale}/checkout$`))
  await expect(page.getByRole('complementary')).toContainText(moneyPattern(total, locale))
  await page.getByLabel(t.email, { exact: true }).fill(who.email)
  await page.getByLabel(t.firstName, { exact: true }).fill(who.firstName)
  await page.getByLabel(t.lastName, { exact: true }).fill(who.lastName)
  await page.getByLabel(t.address, { exact: true }).fill(who.address)
  await page.getByLabel(t.postalCode, { exact: true }).fill(who.postalCode)
  await page.getByLabel(t.city, { exact: true }).fill(who.city)
}

/**
 * Types Stripe's test card 4242 4242 4242 4242 into the card form and pays. Resolves with the
 * PaymentIntent's ID once Stripe has taken the payment, as the browser leaves for the shop's
 * return path (`/<locale>/checkout/return?payment_intent=…`).
 */
export async function payWithTestCard(page: Page, locale: Locale, total: number): Promise<string> {
  const card = cardFrame(page)
  await card.locator('input[name="number"]').fill('4242 4242 4242 4242')
  await card.locator('input[name="expiry"]').fill('12 / 34')
  await card.locator('input[name="cvc"]').fill('123')
  const returning = page.waitForRequest((request) => new URL(request.url()).pathname === `/${locale}/checkout/return`, { timeout: 60_000 })
  const pay = page.getByRole('button', { name: new RegExp(`^${words[locale].pay}`) })
  await expect(pay).toContainText(moneyPattern(total, locale))
  // The button does nothing until Stripe's form says it is ready.
  await expect(pay).not.toHaveAttribute('aria-disabled', 'true')
  await pay.click()
  const paymentIntent = new URL((await returning).url()).searchParams.get('payment_intent')
  expect(paymentIntent, 'the return path carries the PaymentIntent').toMatch(/^pi_[A-Za-z0-9]+$/)
  return paymentIntent!
}
