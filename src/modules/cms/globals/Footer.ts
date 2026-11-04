import type { GlobalConfig } from 'payload'

import { anyone, isStaffOrOwner } from '@/core/access'

import { linkField } from '../fields/link'

/** Footer menu: a list of links and an optional short text per language. No drafts. */
export const Footer: GlobalConfig = {
  slug: 'footer',
  label: { en: 'Footer menu', fr: 'Menu de pied de page' },
  access: { read: anyone, update: isStaffOrOwner },
  versions: false,
  fields: [
    {
      name: 'text',
      type: 'textarea',
      label: { en: 'Text', fr: 'Texte' },
      localized: true,
      admin: { description: { en: 'Optional short text under the links.', fr: 'Court texte facultatif sous les liens.' } },
    },
    {
      name: 'items',
      type: 'array',
      label: { en: 'Links', fr: 'Liens' },
      labels: { singular: { en: 'Link', fr: 'Lien' }, plural: { en: 'Links', fr: 'Liens' } },
      fields: [linkField('link')],
    },
  ],
}
