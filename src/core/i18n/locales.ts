// The locales the code knows. S06 reads which ones a site uses, and its default, from light.config.ts.
export const locales = ['fr', 'en'] as const

export type Locale = (typeof locales)[number]

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}
