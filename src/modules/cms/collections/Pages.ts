import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { isStaffOrOwner, publishedOrStaff } from '@/core/access'
import { forcePublishedForPublic, readVersions } from '@/core/access/drafts'
import { publishInEveryLocale } from '@/core/collections/publishEverywhere'

import { cmsBlocks } from '../blocks'
import { requiredInDefaultLocale } from '../fields/requiredInDefaultLocale'
import { HOME_SLUG, RESERVED_SLUGS } from '../fields/slugs'
import { slugify } from '../fields/slugify'

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: {
    singular: { en: 'Page', fr: 'Page' },
    plural: { en: 'Pages', fr: 'Pages' },
  },
  access: {
    read: publishedOrStaff,
    create: isStaffOrOwner,
    update: isStaffOrOwner,
    delete: isStaffOrOwner,
    readVersions,
  },
  // Publishing a page publishes it in every language, like a product: text not translated yet
  // shows in the default language (core's `publishInEveryLocale`).
  hooks: { beforeOperation: [forcePublishedForPublic, publishInEveryLocale] },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    description: {
      en: 'Publish puts the page online in every language at once. Text not yet translated shows in the default language.',
      fr: 'Publier met la page en ligne dans toutes les langues à la fois. Un texte pas encore traduit s’affiche dans la langue par défaut.',
    },
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', label: { en: 'Title', fr: 'Titre' }, localized: true, validate: requiredInDefaultLocale },
    {
      name: 'slug',
      type: 'text',
      label: { en: 'Slug', fr: 'Adresse' },
      localized: true,
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: {
          en: 'The address of the page. Made from the title when left empty.',
          fr: 'L’adresse de la page. Créée à partir du titre si elle reste vide.',
        },
      },
      hooks: {
        beforeValidate: [
          ({ value, siblingData }) => {
            const source = typeof value === 'string' && value ? value : siblingData?.title
            return typeof source === 'string' ? slugify(source) : value
          },
        ],
        // The home page keeps the slug `home` in every language, whatever the title says.
        beforeChange: [
          async ({ value, req, originalDoc }) => {
            const defaultLocale = (req.payload.config.localization || undefined)?.defaultLocale
            if (!originalDoc?.id || !defaultLocale || !req.locale || req.locale === defaultLocale) return value
            const base = await req.payload.findByID({
              collection: 'pages',
              id: originalDoc.id,
              locale: defaultLocale as 'fr' | 'en',
              fallbackLocale: false,
              depth: 0,
              draft: true,
              overrideAccess: true,
              // A copy of the request, so reading in the default language leaves this one alone.
              req: { ...req, locale: defaultLocale, fallbackLocale: false } as typeof req,
            })
            return base.slug === HOME_SLUG ? HOME_SLUG : value
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
    { name: 'layout', type: 'blocks', label: { en: 'Content', fr: 'Contenu' }, labels: { singular: { en: 'Block', fr: 'Bloc' }, plural: { en: 'Blocks', fr: 'Blocs' } }, blocks: cmsBlocks },
  ],
}
