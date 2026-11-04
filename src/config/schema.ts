import * as z from 'zod'

import { locales } from '@/core/i18n/locales'

// The shape of light.config.ts (plan, Shared contracts). Every object is strict, so a misspelt
// key fails instead of being ignored. The messages here are plain words; `formatProblems`
// (errors.ts) puts the path in front and words missing settings and wrong types itself.

const text = z.string().trim().min(1, { error: 'must not be empty' })

const email = z.email({ error: 'expected an email address, like "hello@example.com"' })

// Hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or a CSS colour function. Only characters a colour needs,
// because S22 writes these values into CSS custom properties.
const cssColour = z
  .string()
  .regex(
    /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([0-9a-z.,%/+\-\s]+\))$/i,
    { error: 'expected a CSS colour, like "#7A3B6E", "rgb(122 59 110)" or "oklch(0.45 0.1 330)"' },
  )

const fontFamily = z
  .string()
  .regex(/^[\p{L}\p{N}\s,'"_-]+$/u, {
    error: 'expected a font family, like "Source Sans 3" or "system-ui, sans-serif"',
  })

const localeCode = z.enum(locales, {
  error: (issue) =>
    `unknown locale ${JSON.stringify(issue.input)}, expected ${locales.map((code) => `"${code}"`).join(' or ')}`,
})

const shopSchema = z.strictObject({
  currency: z.literal('EUR', { error: 'expected "EUR", the only currency for now' }),
  pricesIncludeTax: z.literal(true, { error: 'expected true: prices always include tax for now' }),
  /** Percent, shown next to prices ("incl. 5.5 % VAT"). Not used to compute amounts. */
  displayTaxRate: z
    .number()
    .min(0, { error: 'expected a percentage from 0 to 100, like 20 or 5.5' })
    .max(100, { error: 'expected a percentage from 0 to 100, like 20 or 5.5' }),
  shipping: z.strictObject({
    /** Cents, per order. Money is always integer cents. */
    flatRate: z
      .number()
      .int({ error: 'expected a whole number of cents, 0 or more (490 is 4.90 €)' })
      .nonnegative({ error: 'expected a whole number of cents, 0 or more (490 is 4.90 €)' }),
    /** ISO 3166-1 alpha-2 codes of the countries the shop ships to. */
    countries: z
      .array(
        z.string().regex(/^[A-Z]{2}$/, {
          error: 'expected a two-letter country code in capitals (ISO 3166-1 alpha-2), like "FR"',
        }),
      )
      .min(1, { error: 'list at least one country' }),
  }),
})

const modulesSchema = z
  .strictObject({ cms: z.boolean(), shop: z.boolean() })
  .refine((modules) => modules.cms || modules.shop, {
    error: 'switch on at least one module (cms, shop or both)',
  })

export const lightConfigSchema = z
  .strictObject({
    site: z.strictObject({
      name: text,
      url: z.url({
        protocol: /^https?$/,
        error: 'expected a full http(s) URL, like "https://example.com"',
      }),
      /** false keeps search engines away (noindex, robots.txt). */
      indexable: z.boolean(),
      contactEmail: email,
    }),
    locales: z
      .strictObject({
        available: z.array(localeCode).min(1, { error: 'list at least one locale' }),
        default: localeCode,
      })
      .refine((value) => value.available.includes(value.default), {
        path: ['default'],
        error: (issue) => {
          const value = issue.input as { default: string }
          return `"${value.default}" is not in locales.available`
        },
      }),
    modules: modulesSchema,
    theme: z.strictObject({
      colors: z.strictObject({
        primary: cssColour,
        primaryContrast: cssColour,
        background: cssColour,
        surface: cssColour,
        text: cssColour,
        muted: cssColour,
      }),
      fonts: z.strictObject({ heading: fontFamily, body: fontFamily }),
      /** A file in public/, as a URL path: '/logo.svg' is public/logo.svg. */
      logo: z.string().regex(/^\/(?!\/)(?!.*\.\.)[\w\-./]+$/, {
        error: 'expected a path under public/, starting with "/", like "/logo.svg"',
      }),
    }),
    email: z.strictObject({
      fromName: text,
      fromAddress: email,
      ownerNotificationsTo: email,
    }),
    /** Required when modules.shop is true. Still checked when present while the shop is off. */
    shop: shopSchema.optional(),
  })
  .refine((config) => !config.modules.shop || config.shop !== undefined, {
    path: ['shop'],
    error: 'is missing, and it is required when modules.shop is true',
    // Check this even when other parts are broken, so every problem is listed at once.
    when: (payload) => modulesSchema.safeParse((payload.value as { modules?: unknown })?.modules).success,
  })

/** The validated settings, as `defineLightConfig` and `getLightConfig` return them. */
export type LightConfig = z.output<typeof lightConfigSchema>

/** What light.config.ts passes to `defineLightConfig`. */
export type LightConfigInput = z.input<typeof lightConfigSchema>

/** The `shop` section (S13, S14). */
export type ShopConfig = z.output<typeof shopSchema>
