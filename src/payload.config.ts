import { sqliteAdapter } from '@payloadcms/db-sqlite'
import {
  BoldFeature,
  IndentFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  TableFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { sharpTransformer } from '@payloadcms/transformer-sharp'
import { fileURLToPath } from 'url'

import { Categories } from '@/collections/Categories'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { Users } from '@/collections/Users'
import { Footer } from '@/globals/Footer'
import { Header } from '@/globals/Header'
import { plugins } from './plugins'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below and the import `BeforeLogin` statement on line 15.
      beforeLogin: ['@/components/BeforeLogin#BeforeLogin'],
    },
    dashboard: {
      // The `GettingStarted` widget renders the onboarding steps below the welcome heading.
      // Feel free to delete this at any time. Remove the widget and its `defaultLayout` entry.
      widgets: [
        {
          slug: 'getting-started',
          Component: '@/components/GettingStarted#GettingStarted',
          label: 'Getting Started',
          minWidth: 'full',
        },
      ],
      // Repeats the built-in default layout with `getting-started` inserted after `welcome`.
      defaultLayout: [
        { widgetSlug: 'welcome', width: 'full' },
        { widgetSlug: 'getting-started', width: 'full' },
        { widgetSlug: 'activity', width: 'full' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
    user: Users.slug,
  },
  collections: [Users, Pages, Categories, Media],
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || '',
    },
    // Spike: run pending migrations when Payload initialises in production (Docker).
    prodMigrations: migrations,
    // Spike experiments: the SQLite adapter uses no DB transactions unless transactionOptions is set.
    ...(process.env.SPIKE_SQLITE_TX === '1' ? { transactionOptions: {} } : {}),
    ...(process.env.SPIKE_SQLITE_BUSY ? { busyTimeout: Number(process.env.SPIKE_SQLITE_BUSY) } : {}),
    ...(process.env.SPIKE_SQLITE_WAL === '1' ? { wal: true } : {}),
  }),
  editor: lexicalEditor({
    features: () => {
      return [
        UnderlineFeature(),
        BoldFeature(),
        ItalicFeature(),
        OrderedListFeature(),
        UnorderedListFeature(),
        LinkFeature({
          enabledCollections: ['pages'],
          fields: ({ defaultFields }) => {
            const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
              if ('name' in field && field.name === 'url') return false
              return true
            })

            return [
              ...defaultFieldsWithoutUrl,
              {
                name: 'url',
                type: 'text',
                admin: {
                  condition: ({ linkType }) => linkType !== 'internal',
                },
                label: ({ t }) => t('fields:enterURL'),
                required: true,
              },
            ]
          },
        }),
        IndentFeature(),
        TableFeature(),
      ]
    },
  }),
  //email: nodemailerAdapter(),
  endpoints: [],
  globals: [Header, Footer],
  plugins,
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Spike: image variants, to measure memory during an admin upload.
  upload: {
    transformers: [
      sharpTransformer({
        collections: {
          media: {
            variants: [
              { name: 'thumbnail', width: 400 },
              { name: 'card', width: 800 },
              { name: 'large', width: 1600 },
            ],
          },
        },
      }),
    ],
  },
  // Sharp is now an optional dependency -
  // if you want to resize images, crop, set focal point, etc.
  // make sure to install it and pass it to the config.
  // sharp,
})
