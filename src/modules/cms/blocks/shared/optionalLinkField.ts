import type { Field } from 'payload'

import { linkField } from '../../fields/link'

type LinkData = { label?: unknown; page?: unknown; url?: unknown } | null | undefined

const isEmpty = (link: LinkData) => !link?.label && !link?.page && !link?.url

/**
 * `linkField()` that may stay empty: with no label, page and URL the link is valid and simply not
 * shown. Once any of them is filled in, the usual rules apply (label in the default language, a
 * page or a valid URL).
 */
export function optionalLinkField(name = 'link'): Field {
  const field = linkField(name)
  if (field.type !== 'group') return field
  return {
    ...field,
    admin: { ...field.admin, description: {
        en: 'Optional. Leave the label and the page empty for no button.',
        fr: 'Facultatif. Laissez le libellé et la page vides pour ne pas afficher de bouton.',
      } },
    fields: field.fields.map((sub) => {
      if (!('validate' in sub) || typeof sub.validate !== 'function') return sub
      const validate = sub.validate as (value: unknown, options: { siblingData?: unknown }) => unknown
      return {
        ...sub,
        validate: (value: unknown, options: { siblingData?: unknown }) =>
          isEmpty(options.siblingData as LinkData) ? true : validate(value, options),
      } as Field
    }),
  }
}
