import { EUR, ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import type { Plugin } from 'payload'

import type { LightConfig, ShopConfig } from '@/config/schema'
import { anyone, isStaffOrOwner, publishedOrStaff } from '@/core/access'

import { addProductGridToPages } from './blocks/ProductGrid/extendPages'
import { cartItemMatcher } from './cart/matcher'
import { addressesOverride } from './collections/Addresses'
import { cartsOverride } from './collections/Carts'
import { ordersOverride } from './collections/Orders'
import { productsOverride } from './collections/Products'
import { transactionsOverride } from './collections/Transactions'
import { stripePaymentMethod } from './payments/stripe'

// The shop module: wraps Payload's ecommerce plugin (products, stock, carts, orders) and adds
// shipping, checkout and order emails. It registers its own collections, hooks and endpoints on
// the config it receives, and never imports from the CMS module.

/** The plugin's currency for each `shop.currency` that light.config.ts accepts. */
const currencies = { EUR } satisfies Record<ShopConfig['currency'], typeof EUR>

export const shopPlugin =
  ({ config }: { config: LightConfig }): Plugin =>
  (incomingConfig) => {
    if (!config.shop) {
      throw new Error('The shop module is on but light.config.ts has no `shop` section.')
    }
    const currency = currencies[config.shop.currency]
    const currenciesConfig = { supportedCurrencies: [currency], defaultCurrency: currency.code }
    // The shop's block for CMS pages, when the CMS is on (found in the config, never imported).
    return ecommercePlugin({
      access: {
        // "Admin" in the plugin means our staff and owners: they manage products and orders.
        isAdmin: isStaffOrOwner,
        adminOnlyFieldAccess: isStaffOrOwner,
        adminOrPublishedStatus: publishedOrStaff,
        // Guests only: the public site has no customer accounts, so nobody owns a cart, an
        // address or an order through a login. Every user is staff or an owner (`isAdmin`).
        isCustomer: () => false,
        isDocumentOwner: ({ req }) => (req.user ? { customer: { equals: req.user.id } } : false),
        isAuthenticated: ({ req }) => Boolean(req.user),
        publicAccess: anyone,
      },
      // The plugin's customers are our users (no separate customers collection).
      customers: { slug: 'users' },
      currencies: currenciesConfig,
      // Guest carts, reached with the cart's secret. The matcher survives lines whose product was deleted.
      carts: { allowGuestCarts: true, cartItemMatcher, cartsCollectionOverride: cartsOverride },
      addresses: { addressesCollectionOverride: addressesOverride },
      orders: { ordersCollectionOverride: ordersOverride(currenciesConfig) },
      transactions: { transactionsCollectionOverride: transactionsOverride(currenciesConfig) },
      // Variants are off: they add three collections and the plugin skips their stock check.
      products: { variants: false, productsCollectionOverride: productsOverride },
      // Stripe, through the shop's wrapper: it charges the cart's price today plus shipping.
      payments: { paymentMethods: [stripePaymentMethod()] },
    })(addProductGridToPages(incomingConfig))
  }
