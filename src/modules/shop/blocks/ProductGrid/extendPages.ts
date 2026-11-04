import type { Config } from 'payload'

import { productGridBlock } from './config'

/**
 * Adds the `productGrid` block to the `layout` of the `pages` collection, when there is one. The
 * shop never imports the CMS: it finds the collection in the config it receives. Everything else
 * of the collection (hooks, access, other fields) is kept as it is, and the block list is a new
 * array, since the CMS shares its own with every config it builds.
 */
export function addProductGridToPages(config: Config): Config {
  const collections = config.collections
  if (!collections?.some((collection) => collection.slug === 'pages')) return config
  return {
    ...config,
    collections: collections.map((collection) => {
      if (collection.slug !== 'pages') return collection
      return {
        ...collection,
        fields: collection.fields.map((field) => {
          if (field.type !== 'blocks' || field.name !== 'layout') return field
          const blocks = field.blocks ?? []
          if (blocks.some((block) => typeof block !== 'string' && block.slug === productGridBlock.slug)) return field
          return { ...field, blocks: [...blocks, productGridBlock] }
        }),
      }
    }),
  }
}
