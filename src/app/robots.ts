import type { MetadataRoute } from 'next'

import { getLightConfig } from '@/config'
import { buildRobots } from '@/core/seo'

// Read the config per request, not at build time.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getLightConfig().site)
}
