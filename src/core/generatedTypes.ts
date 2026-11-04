import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Config } from 'payload'

import type { LightConfig } from '@/config/schema'

import { srcDir } from './paths'

/**
 * Where Payload writes its generated types (`pnpm generate`, `payload build`, `next dev`).
 *
 * The committed src/payload-types.ts describes every module, because the code of every module
 * is type-checked, whichever modules are on. Only a setup with all modules on writes it. With a
 * module off, the types would lack that module's collections and its code would fail to
 * type-check, so they go to a scratch file instead.
 */
export function generatedTypesConfig({ config }: { config: LightConfig }) {
  const { cms, shop } = config.modules
  return {
    // Outside production Payload rewrites the types on init. Not under vitest: tests must never
    // change committed files (`pnpm generate` owns them).
    autoGenerate: !process.env.VITEST,
    outputFile:
      cms && shop
        ? path.resolve(srcDir, 'payload-types.ts')
        : path.join(tmpdir(), `light-commerce-payload-types.${cms ? 'cms' : 'shop'}-only.ts`),
  } satisfies Config['typescript']
}
