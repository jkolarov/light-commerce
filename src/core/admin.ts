import type { Config } from 'payload'

import type { LightConfig } from '@/config/schema'

import { Users } from './collections/Users'
import { srcDir } from './paths'

// Admin panel settings. S03 adds the site name and logo from light.config.ts here.
export function adminConfig(_opts: { config: LightConfig }) {
  return {
    user: Users.slug,
    importMap: {
      baseDir: srcDir,
    },
  } satisfies Config['admin']
}
