import type { Field, NumberFieldSingleValidation, TextFieldSingleValidation } from 'payload'

// Field helpers for the shop's collection overrides.

/**
 * Money is a whole number of cents, 0 or more (empty is allowed: the price may be switched off).
 * The plugin's price fields are plain numbers and only the admin's price input converts euros to
 * cents, so the Local API, REST or a seed could otherwise store 12.5.
 */
export const wholeCents: NumberFieldSingleValidation = (value) =>
  value == null || (Number.isInteger(value) && value >= 0)
    ? true
    : 'Expected a whole number of cents, 0 or more (1250 is 12.50 €).'

/** Stock is a whole number of units, 0 or more. */
export const wholeUnits: NumberFieldSingleValidation = (value) =>
  value == null || (Number.isInteger(value) && value >= 0) ? true : 'Expected a whole number of units, 0 or more.'

/**
 * Required in the default language only. In another language the field may stay empty: the default
 * language's text is shown (fallback), and "Publish in all locales" still works.
 * (The CMS has the same rule for its pages; modules don't share code, so it is repeated here.)
 */
export const requiredInDefaultLocale: TextFieldSingleValidation = (value, { req }) => {
  const isDefault = !req.locale || req.locale === (req.payload.config.localization || undefined)?.defaultLocale
  return isDefault && !value ? 'This field is required.' : true
}

/** Applies `change` to every field, inside rows, unnamed groups, collapsibles and tabs too. */
export function mapFields(fields: Field[], change: (field: Field) => Field): Field[] {
  return fields.map((field) => {
    if (field.type === 'tabs') {
      return change({ ...field, tabs: field.tabs.map((tab) => ({ ...tab, fields: mapFields(tab.fields, change) })) })
    }
    if ((field.type === 'row' || field.type === 'collapsible' || field.type === 'group') && 'fields' in field) {
      return change({ ...field, fields: mapFields(field.fields, change) } as Field)
    }
    return change(field)
  })
}

/** Lowercase ASCII with hyphens: "La Veillée" becomes "la-veillee". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
