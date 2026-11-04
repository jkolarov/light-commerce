/** The page shown at `/<locale>`. Its slug is the same in every language. */
export const HOME_SLUG = 'home'

/** Routes of the shop live under the same `[locale]` segment, so no page may take these slugs. */
export const RESERVED_SLUGS = ['shop', 'cart', 'checkout', 'order']
