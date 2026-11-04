import { getRequestConfig } from 'next-intl/server'

import { getLightConfig } from '@/config'

import { isLocale } from './locales'

// next-intl's request config (wired in next.config.ts). The proxy sets the locale from the URL;
// `setRequestLocale` in the layout does the same for static rendering. Messages are loaded by
// relative path because Next's config loader and the plugin don't resolve `@/` aliases.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = requested && isLocale(requested) ? requested : getLightConfig().locales.default
  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
  }
})
