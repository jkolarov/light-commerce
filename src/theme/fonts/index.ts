import localFont from 'next/font/local'

import type { LoadedFonts } from './families'

// The fonts the theme ships, served by the app itself (next/font/local): no font CDN, and no
// network at build time. `theme.fonts` in light.config.ts names them by family ('Spectral').
// Only the locale layout imports this file (next/font only runs inside Next's compiler); the
// pure parts, and the list tests check the config against, are in ./families.ts.
//
// Every family here is preloaded on every page, so ship only the ones light.config.ts uses.
// The files are the "latin" subset (Western European languages, French and English included).
//
// To add a font (it must be free to self-host, for example under the SIL Open Font License):
//   1. Get its .woff2 files, latin subset, one per weight and style you need (or one variable
//      file per style). Fontsource has them: `npm pack @fontsource/<family>` (or
//      `@fontsource-variable/<family>`) and take `files/<family>-latin-<weight>-<style>.woff2`.
//   2. Put them in `src/theme/fonts/<family>/`, with the font's licence as `OFL.txt`.
//   3. Load them below with `localFont` (one call per family; `adjustFontFallback` is
//      'Times New Roman' for a serif, 'Arial' for a sans-serif), and add the result to `loadedFonts`.
//   4. Add the family to `shippedFamilies` in ./families.ts, with its fallback stack.
//   5. Name it in light.config.ts (`theme.fonts.heading` or `.body`). `pnpm test` checks that
//      both fonts there are shipped (or are a system stack ending in a generic family).

// Headings, product names, quotes. Light 300 for large headings, 400-500 for small ones.
const spectral = localFont({
  src: [
    { path: './spectral/spectral-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: './spectral/spectral-latin-300-italic.woff2', weight: '300', style: 'italic' },
    { path: './spectral/spectral-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './spectral/spectral-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
})

// Body text and the interface. One variable file per style covers every weight.
const sourceSans3 = localFont({
  src: [
    { path: './source-sans-3/source-sans-3-latin-wght-normal.woff2', weight: '200 900', style: 'normal' },
    { path: './source-sans-3/source-sans-3-latin-wght-italic.woff2', weight: '200 900', style: 'italic' },
  ],
  display: 'swap',
  adjustFontFallback: 'Arial',
})

/** The loaded fonts' CSS family names, keyed by the family name used in light.config.ts. */
export const loadedFonts: LoadedFonts = {
  Spectral: spectral.style.fontFamily,
  'Source Sans 3': sourceSans3.style.fontFamily,
}
