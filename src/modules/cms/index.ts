import type { Plugin } from 'payload'

import type { LightConfig } from '@/config/schema'

// The CMS module: pages with blocks, header and footer menus, SEO, sitemap.
// It registers its own collections, globals, hooks and endpoints on the config it receives,
// and never imports from the shop module. Empty until S09.
export const cmsPlugin =
  (_opts: { config: LightConfig }): Plugin =>
  (incomingConfig) =>
    incomingConfig
