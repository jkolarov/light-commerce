import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { isStaffOrOwner, publishedOrStaff } from '@/core/access'

import { cmsBlocks } from '../blocks'
import { slugify } from '../fields/slugify'

// Routes of the shop live under the same `[locale]` segment, so no page may take these slugs.
export const RESERVED_SLUGS = ['shop', 'cart', 'checkout', 'order']

// Title and slug are needed in the default language only. In another language they may stay empty:
// the default language's text is shown (fallback), and publishing in every language still works.
const requiredInDefaultLocale: TextFieldSingleValidation = (value, { req }) => {
  const isDefault = !req.locale || req.locale === (req.payload.config.localization || undefined)?.defaultLocale
  return isDefault && !value ? 'This field is required.' : true
}

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    read: publishedOrStaff,
    create: isStaffOrOwner,
    update: isStaffOrOwner,
    delete: isStaffOrOwner,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', localized: true, validate: requiredInDefaultLocale },
    {
      name: 'slug',
      type: 'text',
      localized: true,
      unique: true,
      index: true,
      admin: { position: 'sidebar', description: 'The address of the page. Made from the title when left empty.' },
      hooks: {
        beforeValidate: [
          ({ value, siblingData }) => {
            const source = typeof value === 'string' && value ? value : siblingData?.title
            return typeof source === 'string' ? slugify(source) : value
          },
        ],
      },
      validate: ((value, options) => {
        if (typeof value === 'string' && RESERVED_SLUGS.includes(value)) {
          return `"${value}" is used by the shop. Choose another slug.`
        }
        return requiredInDefaultLocale(value, options)
      }) satisfies TextFieldSingleValidation,
    },
    // `meta.title`, `meta.description` and `meta.image` are added by the SEO plugin (see index.ts).
    { name: 'layout', type: 'blocks', blocks: cmsBlocks },
  ],
}
