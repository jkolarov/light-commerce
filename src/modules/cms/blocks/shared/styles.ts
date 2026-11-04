// Class names the block components share, so the blocks line up and read as one site. Only the
// theme's colours and fonts (`--lc-*`, through Tailwind's `primary`, `surface`, `text`, `muted`,
// `font-heading`, ...): the blocks look right whatever light.config.ts sets.

/** Page width and side margins, the same for every block. */
export const container = 'mx-auto w-full max-w-[76rem] px-5 sm:px-8 lg:px-12'

/** Vertical space around a block. Consecutive blocks add theirs up, so keep it moderate. */
export const blockSpacing = 'py-8 sm:py-10 lg:py-12'

/**
 * Keyboard focus: a ring in `primary` with a `background` gap, visible on the page, on `surface`
 * and on a `primary` button. The outline also survives forced-colours mode.
 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:shadow-[0_0_0_2px_var(--lc-color-background)]'

/** The one button style: `primary`, sentence case, at least 44 px tall for touch. */
export const button = `inline-flex min-h-11 items-center justify-center rounded-[0.1875rem] bg-primary px-5 py-2.5 text-[0.9375rem] font-semibold leading-tight text-primary-contrast transition-colors hover:bg-primary/88 ${focusRing}`

/** Links inside text: `primary` and underlined, never colour alone. */
export const textLink = `rounded-[1px] text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 ${focusRing}`

/** The page title (the hero's heading): large, light and quiet. Size sets the hierarchy, not weight. */
export const displayHeading =
  'font-heading text-[2.5rem] font-light leading-[1.06] tracking-[-0.015em] text-balance sm:text-[3.25rem] lg:text-[4.125rem]'

/** A block's own heading (h2). */
export const sectionHeading =
  'font-heading text-[1.875rem] font-light leading-[1.12] tracking-[-0.01em] text-balance sm:text-[2.375rem]'

/** Photos sit on a `surface` tile, so the space is reserved and tinted while they load. */
export const photoFrame = 'overflow-hidden rounded-[0.25rem] bg-surface'
