import path from 'path'
import { fileURLToPath } from 'url'

/** Absolute path of `src/`: where Payload writes the generated types and resolves admin component paths. */
export const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
