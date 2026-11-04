import { NextResponse, type NextRequest } from 'next/server'

import { getLightConfig } from '@/config'
import { routeLocale } from '@/core/i18n/routing'
import { applyNoindex } from '@/core/seo'

// The one proxy (Next's middleware). S12 sets the noindex header; S06 routes locales:
// `/` goes to the default locale, and a page under a locale tells next-intl which one.
// Read the config per request, so `site.indexable` is not baked in at build time.
export function proxy(request: NextRequest) {
  const { site, locales } = getLightConfig()
  const route = routeLocale(request.nextUrl.pathname, locales)

  if (route.kind === 'redirect') {
    // Temporary: the default locale can change in light.config.ts.
    const url = request.nextUrl.clone()
    url.pathname = route.to
    return applyNoindex(NextResponse.redirect(url, 307), site)
  }

  // next-intl reads the locale from this request header, so pages need no `setRequestLocale`.
  const headers = new Headers(request.headers)
  headers.delete('x-next-intl-locale')
  if (route.kind === 'page') headers.set('x-next-intl-locale', route.locale)
  return applyNoindex(NextResponse.next({ request: { headers } }), site)
}

export const config = {
  // Every path, including /admin and /api; Next's static files need no header.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
