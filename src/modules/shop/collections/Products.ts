import type { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'
import type { CollectionBeforeOperationHook, Field } from 'payload'

import { isStaffOrOwner, publishedOrStaff } from '@/core/access'
import { forcePublishedForPublic, readVersions } from '@/core/access/drafts'

import { shopGroup } from './admin'
import { mapFields, requiredInDefaultLocale, slugify, wholeCents, wholeUnits } from './fields'

// Products: the plugin's collection (stock in `inventory`, price in `priceInEUR`, in cents) plus
// the text and photos the shop shows. Name, summary, description and facts are per language,
// with the default language filling any gap; the slug and the photos are shared.

/** Deleted products go to the trash, where only staff and owners see them (`?trash=true`). */
const hideTrashFromPublic: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'read' && operation !== 'readDistinct' && operation !== 'count') return args
  const readArgs = args as { overrideAccess?: boolean; trash?: boolean }
  if (readArgs.overrideAccess || isStaffOrOwner({ req })) return args
  return { ...args, trash: false } as typeof args
}

const contentFields: Field[] = [
  { name: 'title', type: 'text', label: { en: 'Name', fr: 'Nom' }, localized: true, validate: requiredInDefaultLocale },
  {
    // One slug for every language: the product page is /<locale>/shop/<slug>. Made from the name
    // when the product is created, then kept (Payload's slug field: unique, indexed, in the sidebar).
    name: 'slug',
    type: 'slug',
    useAsSlug: 'title',
    slugify: ({ valueToSlugify }) => (typeof valueToSlugify === 'string' ? slugify(valueToSlugify) : undefined),
  },
  {
    name: 'summary',
    type: 'text',
    localized: true,
    label: { en: 'Summary', fr: 'Résumé' },
    admin: {
      description: {
        en: 'One short line for product cards, for example "Bright and lemony, whole leaves".',
        fr: 'Une ligne courte pour les fiches produit, par exemple « Citronnée et vive, feuilles entières ».',
      },
    },
  },
  { name: 'description', type: 'richText', label: { en: 'Description', fr: 'Description' }, localized: true },
  {
    name: 'images',
    type: 'upload',
    relationTo: 'media',
    hasMany: true,
    label: { en: 'Photos', fr: 'Photos' },
    admin: {
      description: {
        en: 'The first photo is the main one; the others form the gallery.',
        fr: 'La première photo est la principale ; les autres forment la galerie.',
      },
    },
  },
  {
    // The rows are shared by every language, each label and value is translated.
    name: 'facts',
    type: 'array',
    label: { en: 'Facts', fr: 'Caractéristiques' },
    admin: {
      description: {
        en: 'Short facts shown on the product page, in this order (plant, harvest, net weight…).',
        fr: 'Courtes caractéristiques affichées sur la page produit, dans cet ordre (plante, récolte, poids net…).',
      },
    },
    fields: [
      { name: 'label', type: 'text', label: { en: 'Label', fr: 'Libellé' }, localized: true, validate: requiredInDefaultLocale },
      { name: 'value', type: 'text', label: { en: 'Value', fr: 'Valeur' }, localized: true, validate: requiredInDefaultLocale },
    ],
  },
]

/** The plugin's price and stock fields, held to whole numbers, with the price switched on by default. */
const priceAndStock = (field: Field): Field => {
  if (field.type === 'checkbox' && /^priceIn[A-Z]{3}Enabled$/.test(field.name)) return { ...field, defaultValue: true }
  if (field.type !== 'number' || field.hasMany) return field
  if (/^priceIn[A-Z]{3}$/.test(field.name)) return { ...field, validate: wholeCents }
  if (field.name === 'inventory') return { ...field, validate: wholeUnits }
  return field
}

export const productsOverride: CollectionOverride = ({ defaultCollection }) => ({
  ...defaultCollection,
  access: {
    read: publishedOrStaff,
    create: isStaffOrOwner,
    update: isStaffOrOwner,
    delete: isStaffOrOwner,
    readVersions,
  },
  admin: {
    ...defaultCollection.admin,
    group: shopGroup,
    useAsTitle: 'title',
    defaultColumns: ['title', 'priceInEUR', 'inventory', '_status', 'updatedAt'],
  },
  hooks: {
    ...defaultCollection.hooks,
    beforeOperation: [...(defaultCollection.hooks?.beforeOperation ?? []), forcePublishedForPublic, hideTrashFromPublic],
  },
  // Drafts without autosave, like pages: a draft is saved only when someone clicks "Save draft".
  versions: { drafts: true },
  fields: [...contentFields, ...mapFields(defaultCollection.fields, priceAndStock)],
})
