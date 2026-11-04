import type { Config } from 'payload'

import type { LightConfig } from '@/config/schema'

import { Users } from './collections/Users'
import { srcDir } from './paths'

// Admin panel settings. The site name and logo come from light.config.ts.
export function adminConfig({ config }: { config: LightConfig }) {
  return {
    user: Users.slug,
    importMap: {
      baseDir: srcDir,
    },
    meta: {
      // Every admin tab reads "<page> - <site name>" instead of "<page> - Payload".
      titleSuffix: `- ${config.site.name}`,
    },
    components: {
      graphics: {
        // The login page shows the site's logo instead of Payload's. Payload 4 shows no brand
        // icon in the navigation, so `graphics.Icon` stays the default.
        Logo: {
          path: '/core/AdminLogo#AdminLogo',
          clientProps: { src: config.theme.logo, alt: config.site.name },
        },
      },
    },
  } satisfies Config['admin']
}
