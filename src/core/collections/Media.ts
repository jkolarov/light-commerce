import { APIError, type CollectionConfig } from 'payload'

import { anyone, isStaffOrOwner } from '../access'
import { mediaDir } from '../paths'

// Media library: images for pages, products and SEO. Stored on local disk (S3 is a later phase).
// Resizing is configured on the sharp transformer, see `mediaSharp` below.

/** Largest file accepted, in bytes. */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024

/** SVG is for logos. Sharp does not resize it: it is stored as is and has no variants. */
export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: { en: 'Media', fr: 'Média' },
    plural: { en: 'Media', fr: 'Médias' },
  },
  access: {
    read: anyone,
    create: isStaffOrOwner,
    update: isStaffOrOwner,
    delete: isStaffOrOwner,
  },
  admin: {
    useAsTitle: 'filename',
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: { en: 'Alternative text', fr: 'Texte alternatif' },
      admin: {
        description: {
          en: 'Describes the image for screen readers and search engines.',
          fr: 'Décrit l’image pour les lecteurs d’écran et les moteurs de recherche.',
        },
      },
      localized: true,
      required: true,
    },
  ],
  hooks: {
    // Runs before the file is read or resized. REST uploads hit the same limit earlier, in the
    // body parser (`upload.limits` in the core config).
    beforeOperation: [
      ({ args, operation }) => {
        if (operation !== 'create' && operation !== 'update') return args
        const file = args.req?.file
        if (file && file.size > MEDIA_MAX_BYTES) {
          throw new APIError(
            `The file is too large (${Math.ceil(file.size / 1024 / 1024)} MB). The maximum is 10 MB.`,
            400,
            undefined,
            true,
          )
        }
        return args
      },
    ],
  },
  upload: {
    // Absolute and from env, so files land on the Docker volume (S08 sets MEDIA_DIR).
    staticDir: mediaDir(),
    mimeTypes: MEDIA_MIME_TYPES,
    adminThumbnail: 'thumbnail',
  },
}

// Memory is the constraint (768 MB peak in the demo container): the stored original is resized
// to at most 2400 px wide, and the variants are the four sizes the site draws and nothing more.
// Sharp makes them one after the other from the same decoded file.
//  - thumbnail 400 w: admin list, product thumbnails, small cart lines.
//  - card 800 w: product cards, image + text blocks (shown up to about 400 css px, 2x screens).
//  - hero 1920 w: full-width hero banners.
//  - og 1200x630 crop: social share image (Open Graph's 1.91:1 ratio).
// WebP everywhere. `withoutEnlargement` is on for every size (og included), so a small image is never upscaled: the variant
// is then missing or the original size and callers fall back to the original `url`.
const webp = { format: 'webp', options: { quality: 80 } } as const

export const mediaSharp = {
  resizeOptions: { width: 2400, withoutEnlargement: true },
  variants: [
    { name: 'thumbnail', width: 400, withoutEnlargement: true, formatOptions: webp },
    { name: 'card', width: 800, withoutEnlargement: true, formatOptions: webp },
    { name: 'hero', width: 1920, withoutEnlargement: true, formatOptions: webp },
    {
      name: 'og',
      width: 1200,
      height: 630,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
      formatOptions: webp,
    },
  ],
} satisfies NonNullable<
  NonNullable<Parameters<typeof import('@payloadcms/transformer-sharp').sharpTransformer>[0]>['collections']
>['media']
