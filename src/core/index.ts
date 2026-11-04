import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { sharpTransformer } from '@payloadcms/transformer-sharp'
import path from 'path'
import type { Config } from 'payload'
import { fileURLToPath } from 'url'

import type { LightConfig } from '@/config/schema'

import { Users } from './collections/Users'
import { database } from './db'
import { localization } from './i18n/localization'

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Core: the base Payload config every site has, whichever modules are on.
// Core collections, globals and settings are added here; modules add theirs in their plugin.
export function coreConfig(_opts: { config: LightConfig }) {
  return {
    admin: {
      user: Users.slug,
      importMap: {
        baseDir: srcDir,
      },
    },
    collections: [Users],
    db: database(),
    editor: lexicalEditor(),
    localization,
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: {
      outputFile: path.resolve(srcDir, 'payload-types.ts'),
    },
    upload: {
      // Image variants are configured on the transformer (S05).
      transformers: [sharpTransformer()],
    },
  } satisfies Config
}
