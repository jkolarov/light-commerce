import { ValidationError } from 'payload'
import type { Field, FieldHook, NumberFieldSingleValidation, TextFieldSingleValidation } from 'payload'

// Field helpers for the shop's collection overrides.

/** A whole number, 0 or more. Empty is allowed: a price may be switched off, stock untracked. */
export const isWholeOrEmpty = (value: unknown): value is number | null | undefined =>
  value == null || (typeof value === 'number' && Number.isInteger(value) && value >= 0)

export const CENTS_MESSAGE = 'Expected a whole number of cents, 0 or more (1250 is 12.50 €).'
export const UNITS_MESSAGE = 'Expected a whole number of units, 0 or more.'

/**
 * Money is a whole number of cents, 0 or more. The plugin's price fields are plain numbers and
 * only the admin's price input converts euros to cents, so the Local API, REST or a seed could
 * otherwise store 12.5.
 */
export const wholeCents: NumberFieldSingleValidation = (value) => (isWholeOrEmpty(value) ? true : CENTS_MESSAGE)

/** Stock is a whole number of units, 0 or more. */
export const wholeUnits: NumberFieldSingleValidation = (value) => (isWholeOrEmpty(value) ? true : UNITS_MESSAGE)

/** Throws a validation error on the hook's field. */
export function refuse(message: string, path: (number | string)[] | string, req: Parameters<FieldHook>[0]['req']): never {
  throw new ValidationError({ errors: [{ message, path: Array.isArray(path) ? path.join('.') : path }] }, req.t)
}

/**
 * `beforeChange` that refuses a value that isn't a whole number, on every save. Validators don't
 * run on draft saves, and a draft create still writes the live row, so this is the check that
 * keeps a 12.5 out of the database.
 */
export const refuseUnlessWhole =
  (message: string): FieldHook =>
  ({ value, path, req }) =>
    isWholeOrEmpty(value) ? value : refuse(message, path, req)

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
