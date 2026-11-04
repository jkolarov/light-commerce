import { en } from '@payloadcms/translations/languages/en'
import { fr } from '@payloadcms/translations/languages/fr'
import type { Config } from 'payload'

// The admin panel's own language (menus, buttons). Staff pick FR or EN in their account.
export const adminI18n = {
  supportedLanguages: { en, fr },
  fallbackLanguage: 'en',
} satisfies Config['i18n']
