import type { TextFieldSingleValidation } from 'payload'

/**
 * Required in the default language only. In another language the field may stay empty: the default
 * language's text is shown (fallback), and "Publish in all locales" still works.
 */
export const requiredInDefaultLocale: TextFieldSingleValidation = (value, { req }) => {
  const isDefault = !req.locale || req.locale === (req.payload.config.localization || undefined)?.defaultLocale
  return isDefault && !value ? 'This field is required.' : true
}
