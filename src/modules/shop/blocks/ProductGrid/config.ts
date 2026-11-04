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
  labels: { singular: { en: 'Product grid', fr: 'Grille de produits' }, plural: { en: 'Product grids', fr: 'Grilles de produits' } },
  fields: [
    {
      name: 'heading',
      type: 'text',
      label: { en: 'Heading', fr: 'Titre' },
      localized: true,
      admin: { description: { en: 'Optional. For example "Our best sellers".', fr: 'Facultatif. Par exemple « Nos meilleures ventes ».' } },
    },
    {
      name: 'mode',
      type: 'select',
      label: { en: 'Mode', fr: 'Mode' },
      required: true,
      defaultValue: 'latest',
      options: [
        { label: { en: 'The latest products', fr: 'Les derniers produits' }, value: 'latest' },
        { label: { en: 'Products I pick', fr: 'Produits que je choisis' }, value: 'selected' },
      ],
    },
    {
      name: 'count',
      type: 'number',
      label: { en: 'Count', fr: 'Nombre' },
      min: MIN_PRODUCTS,
      max: MAX_PRODUCTS,
      defaultValue: DEFAULT_COUNT,
      required: true,
      admin: {
        step: 1,
        description: {
          en: `How many of the newest products to show (${MIN_PRODUCTS} to ${MAX_PRODUCTS}).`,
          fr: `Combien des derniers produits afficher (de ${MIN_PRODUCTS} à ${MAX_PRODUCTS}).`,
        },
        condition: (_data, siblingData) => siblingData?.mode !== 'selected',
      },
    },
    {
      name: 'products',
      type: 'relationship',
      label: { en: 'Products', fr: 'Produits' },
      relationTo: 'products',
      hasMany: true,
      required: true,
      minRows: 1,
      maxRows: MAX_PRODUCTS,
      admin: {
        description: {
          en: 'Shown in this order. Products that are not published are left out.',
          fr: 'Affichés dans cet ordre. Les produits non publiés sont ignorés.',
        },
        condition: (_data, siblingData) => siblingData?.mode === 'selected',
      },
    },
  ],
}
