import type { CSSProperties } from 'react'

import type { LightConfig } from '@/config'

import { fontStack, type LoadedFonts } from './fonts/families'

export type ThemeVariables = Record<`--lc-${string}`, string>

/**
 * The theme variables for `<html style>`, from `theme` in light.config.ts (plan, "Theme
 * variables"). They override the defaults in globals.css, and Tailwind's colours and fonts map to
 * them. Writing config values into a style attribute is safe here: the schema (src/config/schema.ts)
 * only lets through the characters a colour or a font family needs, never `;`, `:`, `{` or `<`.
 */
export function themeStyle(theme: LightConfig['theme'], loaded: LoadedFonts): ThemeVariables {
  const { colors, fonts } = theme
  return {
    '--lc-color-primary': colors.primary,
    '--lc-color-primary-contrast': colors.primaryContrast,
    '--lc-color-background': colors.background,
    '--lc-color-surface': colors.surface,
    '--lc-color-text': colors.text,
    '--lc-color-muted': colors.muted,
    '--lc-font-heading': fontStack(fonts.heading, loaded),
    '--lc-font-body': fontStack(fonts.body, loaded),
  }
}

/** The same variables, typed for React's `style` prop. */
export const asStyle = (variables: ThemeVariables) => variables as CSSProperties
