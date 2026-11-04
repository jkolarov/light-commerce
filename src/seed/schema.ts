import * as z from 'zod'

// The shape of demo/content/ (demo/README.md is the contract). Objects are strict, so a misspelt
// key fails instead of being ignored. Strings are kept exactly as written: French typography has
// no-break spaces and typographic apostrophes that must survive.

const text = z.string().min(1, { error: 'must not be empty' })

/** One string per locale. French is the default locale and always there; English may be missing. */
export const localized = z.strictObject({ fr: text, en: text.optional() })

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'expected a slug: lowercase ASCII with hyphens' })

const fileName = z.string().regex(/^[\w.-]+$/, { error: 'expected a file name in images/, like "garrigue.jpg"' })

export const link = z.strictObject({
  type: z.enum(['page', 'product'], { error: 'expected "page" or "product"' }),
  slug,
  label: localized,
})

const cents = z
  .number()
  .int({ error: 'expected a whole number of cents, 0 or more (790 is 7.90 €)' })
  .nonnegative({ error: 'expected a whole number of cents, 0 or more (790 is 7.90 €)' })

const units = z
  .number()
  .int({ error: 'expected a whole number of units, 0 or more' })
  .nonnegative({ error: 'expected a whole number of units, 0 or more' })

export const block = z.discriminatedUnion(
  'blockType',
  [
    z.strictObject({
      blockType: z.literal('hero'),
      heading: localized,
      text: localized.optional(),
      image: fileName,
      link: link.optional(),
    }),
    z.strictObject({ blockType: z.literal('richText'), content: localized }),
    z.strictObject({
      blockType: z.literal('imageText'),
      heading: localized.optional(),
      content: localized,
      image: fileName,
      imagePosition: z.enum(['left', 'right'], { error: 'expected "left" or "right"' }),
      caption: localized.optional(),
    }),
    z.strictObject({ blockType: z.literal('callToAction'), heading: localized, text: localized.optional(), link }),
    z.strictObject({
      blockType: z.literal('productGrid'),
      heading: localized.optional(),
      // Product slugs, in display order; the seed turns them into ids.
      products: z.array(slug).min(1, { error: 'list at least one product' }).max(12, { error: 'list at most 12 products' }),
    }),
  ],
  { error: 'expected a blockType: "hero", "richText", "imageText", "callToAction" or "productGrid"' },
)

export const page = z.strictObject({
  slug: z.strictObject({ fr: slug, en: slug.optional() }),
  title: localized,
  seo: z.strictObject({ title: localized, description: localized, image: fileName.optional() }),
  layout: z.array(block).min(1, { error: 'a page needs at least one block' }),
})

export const products = z.array(
  z.strictObject({
    slug,
    name: localized,
    summary: localized.optional(),
    description: localized,
    facts: z.array(z.strictObject({ label: localized, value: localized })).optional(),
    price: cents,
    stock: units,
    images: z.array(fileName).min(1, { error: 'list at least one photo' }),
  }),
)

export const media = z.array(z.strictObject({ file: fileName, alt: localized }))

export const menus = z.strictObject({ header: z.array(link), footer: z.array(link) })

export type Localized = z.infer<typeof localized>
export type DemoLink = z.infer<typeof link>
export type DemoBlock = z.infer<typeof block>
export type DemoProduct = z.infer<typeof products>[number]
export type DemoMedia = z.infer<typeof media>[number]
export type DemoMenus = z.infer<typeof menus>
/** A page, with `file`: its file name in content/pages/ (its French slug). */
export type DemoPage = z.infer<typeof page> & { file: string }
