import localFont from 'next/font/local'

import type { LoadedFonts } from './families'

// The fonts the theme ships, served by the app itself (next/font/local): no font CDN, and no
// network at build time. `theme.fonts` in light.config.ts names them by family ('Spectral').
// Only the locale layout imports this file (next/font only runs inside Next's compiler); the
// pure parts, and the list tests check the config against, are in ./families.ts.
//
// Each family is two `localFont` calls that declare the same `font-family`, so the browser sees
// one family:
//   - the faces a page needs on first paint, preloaded on every page;
//   - the others (italics, rare weights), with `preload: false`: fetched only when a page uses them.
// A test keeps what is preloaded small (tests/theme/fonts.test.ts), so ship only the families
// light.config.ts uses. The files are the "latin" subset (Western European languages, French and
// English included).
//
// To add a font (it must be free to self-host, for example under the SIL Open Font License):
//   1. Get its .woff2 files, latin subset, one per weight and style you need (or one variable
//      file per style). Fontsource has them: `npm pack @fontsource/<family>` (or
//      `@fontsource-variable/<family>`) and take `files/<family>-latin-<weight>-<style>.woff2`.
//   2. Put them in `src/theme/fonts/<family>/`, with the font's licence as `OFL.txt`.
//   3. Load them below: one call for the first-paint faces, and one with `preload: false` and
//      `adjustFontFallback: false` for the rest, both with the same `font-family` in
//      `declarations` (a CSS name without spaces, like 'sourceSans3'). In the first call,
//      `adjustFontFallback` is 'Times New Roman' for a serif, 'Arial' for a sans-serif. Add the
//      first call's result to `loadedFonts`.
//   4. Add the family to `shippedFamilies` in ./families.ts, with its fallback stack.
//   5. Name it in light.config.ts (`theme.fonts.heading` or `.body`). `pnpm test` checks that
//      both fonts there are shipped (or are a system stack ending in a generic family).

// Headings, product names, quotes. Light 300 for large headings, 400 for titles: first paint.
const spectral = localFont({
  src: [
    { path: './spectral/spectral-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: './spectral/spectral-latin-400-normal.woff2', weight: '400', style: 'normal' },
  ],
  declarations: [{ prop: 'font-family', value: 'spectral' }],
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
})

// Pull quotes (Light Italic) and the smallest headings (500): only when a page uses them.
const spectralRest = localFont({
  src: [
    { path: './spectral/spectral-latin-300-italic.woff2', weight: '300', style: 'italic' },
    { path: './spectral/spectral-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  declarations: [{ prop: 'font-family', value: 'spectral' }],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})

// Body text and the interface. One variable file covers every weight: first paint.
const sourceSans3 = localFont({
  src: [{ path: './source-sans-3/source-sans-3-latin-wght-normal.woff2', weight: '200 900', style: 'normal' }],
  declarations: [{ prop: 'font-family', value: 'sourceSans3' }],
  display: 'swap',
  adjustFontFallback: 'Arial',
})

// Italic body text: only when a page uses it.
const sourceSans3Rest = localFont({
  src: [{ path: './source-sans-3/source-sans-3-latin-wght-italic.woff2', weight: '200 900', style: 'italic' }],
  declarations: [{ prop: 'font-family', value: 'sourceSans3' }],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})

/** The loaded fonts' CSS family names, keyed by the family name used in light.config.ts. */
export const loadedFonts: LoadedFonts = {
  Spectral: spectral.style.fontFamily,
  'Source Sans 3': sourceSans3.style.fontFamily,
}

/**
 * The faces loaded only when used. Nothing reads them: they are exported so that no bundler
 * drops their @font-face rules as unused.
 */
export const lazyFaces = [spectralRest, sourceSans3Rest]
