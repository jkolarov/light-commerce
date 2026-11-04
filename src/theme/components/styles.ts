// Class names the theme's components share. Only the theme's colours and fonts (`--lc-*`, through
// Tailwind's `primary`, `surface`, `text`, `muted`, `font-heading`, ...), so everything follows
// light.config.ts. The page width and focus ring match the CMS blocks, so header, footer and
// blocks share their edges.

/** Joins class names, skipping empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}

/** Page width and side margins. */
export const pageWidth = 'mx-auto w-full max-w-[76rem] px-5 sm:px-8 lg:px-12'

/**
 * Keyboard focus: a ring in `primary` with a `background` gap, visible on the page, on `surface`
 * and on a `primary` button. The outline also survives forced-colours mode.
 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:shadow-[0_0_0_2px_var(--lc-color-background)]'

/** Links inside text: `primary` and underlined, never colour alone. */
export const textLink = `rounded-[1px] text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 ${focusRing}`

/** Hairline for edges and separators: `text` at low opacity, so it suits any palette. */
export const hairline = 'border-text/15'
