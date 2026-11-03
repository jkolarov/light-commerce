import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { Plugin } from 'payload'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { EUR, ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import type { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'

import { spikeStripeAdapter } from '@/modules/shop/payments/stripe'

import { Page, Product } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import { ProductsCollection } from '@/collections/Products'
import { adminOrPublishedStatus } from '@/access/adminOrPublishedStatus'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { customerOnlyFieldAccess } from '@/access/customerOnlyFieldAccess'
import { isAdmin } from '@/access/isAdmin'
import { isDocumentOwner } from '@/access/isDocumentOwner'

// Spike: admin reduction experiments. SPIKE_ADMIN_MODE=hidden|readonly|off (default hidden)
const adminMode = process.env.SPIKE_ADMIN_MODE || 'hidden'
const deny = () => false
const hide: CollectionOverride = ({ defaultCollection }) =>
  adminMode === 'off'
    ? defaultCollection
    : { ...defaultCollection, admin: { ...defaultCollection.admin, hidden: true } }
const readOnly: CollectionOverride = ({ defaultCollection }) =>
  adminMode === 'off'
    ? defaultCollection
    : {
        ...defaultCollection,
        access: { ...defaultCollection.access, create: deny, update: deny, delete: deny },
        admin: { ...defaultCollection.admin, group: false },
      }

// Spike: amount breakdown stored on transactions (at initiate) and orders (at finalize).
const breakdownFields = [
  { name: 'subtotal', type: 'number' as const, admin: { readOnly: true } },
  { name: 'shippingAmount', type: 'number' as const, admin: { readOnly: true } },
]

const generateTitle: GenerateTitle<Product | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Ecommerce Template` : 'Payload Ecommerce Template'
}

const generateURL: GenerateURL<Product | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formSubmissionOverrides: {
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
      },
      admin: {
        group: 'Content',
      },
    },
    formOverrides: {
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
        create: isAdmin,
      },
      admin: {
        group: 'Content',
      },
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
  }),
  ecommercePlugin({
    access: {
      adminOnlyFieldAccess,
      adminOrPublishedStatus,
      customerOnlyFieldAccess,
      isAdmin,
      isDocumentOwner,
    },
    addresses: { addressesCollectionOverride: hide },
    carts: { cartsCollectionOverride: hide },
    currencies: { supportedCurrencies: [EUR], defaultCurrency: 'EUR' },
    customers: {
      slug: 'users',
    },
    transactions: {
      transactionsCollectionOverride: async (args) => {
        const c = await readOnly(args)
        return { ...c, fields: [...c.fields, ...breakdownFields] }
      },
    },
    orders: {
      ordersCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        fields: [
          ...defaultCollection.fields,
          ...breakdownFields,
          {
            name: 'accessToken',
            type: 'text',
            unique: true,
            index: true,
            admin: {
              position: 'sidebar',
              readOnly: true,
            },
            hooks: {
              beforeValidate: [
                ({ value, operation }) => {
                  if (operation === 'create' || !value) {
                    return crypto.randomUUID()
                  }
                  return value
                },
              ],
            },
          },
        ],
      }),
    },
    payments: {
      paymentMethods: [
        spikeStripeAdapter(),
      ],
    },
    products: {
      productsCollectionOverride: ProductsCollection,
      variants: {
        variantsCollectionOverride: hide,
        variantOptionsCollectionOverride: hide,
        variantTypesCollectionOverride: hide,
      },
    },
  }),
]
