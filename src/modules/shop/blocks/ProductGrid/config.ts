import type { Block } from 'payload'

/** Most products a grid shows; two is the least that still reads as a row. */
export const MIN_PRODUCTS = 2
export const MAX_PRODUCTS = 12
/** How many of the newest products a new grid shows. */
export const DEFAULT_COUNT = 4

// Products on a CMS page: hand-picked ones, or the newest N. Added to the pages' `layout` by the
// shop plugin (see `./extendPages.ts`), never by the CMS module.
export const productGridBlock: Block = {
  slug: 'productGrid',
  interfaceName: 'ProductGridBlock',
  labels: { singular: 'Product grid', plural: 'Product grids' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      localized: true,
      admin: { description: 'Optional. For example "Our best sellers".' },
    },
    {
      name: 'mode',
      type: 'select',
      required: true,
      defaultValue: 'latest',
      options: [
        { label: 'The latest products', value: 'latest' },
        { label: 'Products I pick', value: 'selected' },
      ],
    },
    {
      name: 'count',
      type: 'number',
      min: MIN_PRODUCTS,
      max: MAX_PRODUCTS,
      defaultValue: DEFAULT_COUNT,
      required: true,
      admin: {
        step: 1,
        description: `How many of the newest products to show (${MIN_PRODUCTS} to ${MAX_PRODUCTS}).`,
        condition: (_data, siblingData) => siblingData?.mode !== 'selected',
      },
    },
    {
      name: 'products',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
      required: true,
      minRows: 1,
      maxRows: MAX_PRODUCTS,
      admin: {
        description: 'Shown in this order. Products that are not published are left out.',
        condition: (_data, siblingData) => siblingData?.mode === 'selected',
      },
    },
  ],
}
