import type { LightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'

/**
 * `email.notice` from light.config.ts in `locale`, or the default language's when `locale` has
 * none, or `null`: the short line both order emails end with (on the demo, that it is a demo).
 */
export function emailNotice(config: Pick<LightConfig, 'email' | 'locales'>, locale: Locale): string | null {
  const notice = config.email.notice
  return notice?.[locale] ?? notice?.[config.locales.default] ?? null
}
