import path from 'node:path'

import sharp from 'sharp'

/** The logo from light.config.ts, with its intrinsic size when it could be read. */
export type LogoImage = { src: string; width?: number; height?: number }

const cache = new Map<string, Promise<LogoImage>>()

/**
 * The logo with its width and height, so the browser reserves its space and the header does not
 * shift when it loads. Read once per path with sharp (an SVG's size comes from its viewBox), then
 * kept for the life of the server: a new logo file takes a restart, like any config change.
 * When the file cannot be read, the logo is drawn without a size, and a warning is logged.
 * `theme.logo` is a checked path under public/ (no `..`), so it stays inside `publicDir`.
 */
export function logoImage(src: string, publicDir = path.join(/* turbopackIgnore: true */ process.cwd(), 'public')): Promise<LogoImage> {
  const file = path.join(publicDir, src)
  let image = cache.get(file)
  if (!image) {
    image = readSize(src, file)
    cache.set(file, image)
  }
  return image
}

async function readSize(src: string, file: string): Promise<LogoImage> {
  try {
    const { width, height } = await sharp(file).metadata()
    return width && height ? { src, width, height } : { src }
  } catch (error) {
    console.warn(`Theme: could not read the size of the logo ${src}; drawing it without width and height.`, error)
    return { src }
  }
}
