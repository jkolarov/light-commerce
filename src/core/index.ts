import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { sharpTransformer } from '@payloadcms/transformer-sharp'
import type { Config } from 'payload'

import type { LightConfig } from '@/config/schema'

import { adminConfig } from './admin'
import { MEDIA_MAX_BYTES, Media, mediaSharp } from './collections/Media'
import { Users } from './collections/Users'
import { database } from './db'
import { generatedTypesConfig } from './generatedTypes'
import { adminI18n } from './i18n/admin'
import { localizationConfig } from './i18n/localization'

// Core: the base Payload config every site has, whichever modules are on.
// Core collections, globals and settings are added here; modules add theirs in their plugin.
export function coreConfig(opts: { config: LightConfig }) {
  return {
    admin: adminConfig(opts),
    collections: [Users, Media],
    db: database(),
    editor: lexicalEditor(),
    i18n: adminI18n,
    localization: localizationConfig(opts),
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: generatedTypesConfig(opts),
    upload: {
      limits: { fileSize: MEDIA_MAX_BYTES },
      // Image variants are configured per collection on the transformer.
      transformers: [sharpTransformer({ collections: { media: mediaSharp } })],
    },
  } satisfies Config
}
