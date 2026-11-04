import type { Plugin } from 'payload'

import type { LightConfig } from '@/config/schema'

// The shop module: wraps Payload's ecommerce plugin (products, stock, carts, orders) and adds
// shipping, checkout and order emails. It registers its own collections, hooks and endpoints on
// the config it receives, and never imports from the CMS module. Empty until S13.
export const shopPlugin =
  (_opts: { config: LightConfig }): Plugin =>
  (incomingConfig) =>
    incomingConfig
