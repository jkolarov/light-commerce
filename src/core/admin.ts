import type { Config } from 'payload'

import type { LightConfig } from '@/config/schema'

import { Users } from './collections/Users'
import { srcDir } from './paths'

/** Date and time in lists and on documents; `PP`/`p` follow the admin language (date-fns locale). */
export const ADMIN_DATE_FORMAT = 'PP, p'

// Admin panel settings. The site name and logo come from light.config.ts.
export function adminConfig({ config }: { config: LightConfig }) {
  return {
    user: Users.slug,
    // date-fns' localized tokens, so the admin language picks the style: "4 nov. 2026, 14:32" in
    // French, "Nov 4, 2026, 2:32 PM" in English. A fixed pattern like "d MMM yyyy" would show
    // English month names in a French layout (or the reverse), and one string can't hold both.
    dateFormat: ADMIN_DATE_FORMAT,
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
