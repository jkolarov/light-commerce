import { NextResponse, type NextRequest } from 'next/server'

import { getLightConfig } from '@/config'
import { applyNoindex } from '@/core/seo'

// The one proxy (Next's middleware). S12 sets the noindex header; S06 adds locale routing here.
// Read the config per request, so `site.indexable` is not baked in at build time.
export function proxy(_request: NextRequest) {
  const response = NextResponse.next()
  return applyNoindex(response, getLightConfig().site)
}

export const config = {
  // Every path, including /admin and /api; Next's static files need no header.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
