import path from 'path'
import { fileURLToPath } from 'url'

/** Absolute path of `src/`: where Payload writes the generated types and resolves admin component paths. */
export const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Where uploaded media is stored: `MEDIA_DIR`, an absolute path (`/app/data/media` in Docker), or
 * `./data/media` from the working directory.
 */
export const mediaDir = () => path.resolve(process.env.MEDIA_DIR || './data/media')
