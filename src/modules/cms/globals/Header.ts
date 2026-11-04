import type { GlobalConfig } from 'payload'

import { anyone, isStaffOrOwner } from '@/core/access'

import { linkField } from '../fields/link'

/** Header menu: up to 7 links, in order. No drafts: a saved menu is live. */
export const Header: GlobalConfig = {
  slug: 'header',
  label: { en: 'Header menu', fr: 'Menu d’en-tête' },
  access: { read: anyone, update: isStaffOrOwner },
  versions: false,
  fields: [
    {
      name: 'items',
      type: 'array',
      label: { en: 'Links', fr: 'Liens' },
      labels: { singular: { en: 'Link', fr: 'Lien' }, plural: { en: 'Links', fr: 'Liens' } },
      maxRows: 7,
      admin: { description: { en: 'Up to 7 links, shown in this order.', fr: 'Jusqu’à 7 liens, affichés dans cet ordre.' } },
      fields: [linkField('link')],
    },
  ],
}
