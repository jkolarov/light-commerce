import { seoPlugin } from '@payloadcms/plugin-seo'
import type { Plugin } from 'payload'

import type { LightConfig } from '@/config/schema'

import { Pages } from './collections/Pages'

// The CMS module: pages with blocks, header and footer menus, SEO, sitemap.
// It registers its own collections, globals, hooks and endpoints on the config it receives,
// and never imports from the shop module.
export const cmsPlugin =
  (_opts: { config: LightConfig }): Plugin =>
  async (incomingConfig) => {
    const withPages = {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), Pages],
    }
    // SEO fields (`meta.title`, `meta.description`, `meta.image`) on the pages, images from `media`.
    return seoPlugin({ collections: ['pages'], uploadsCollection: 'media' })(withPages)
  }
