import type { GlobalConfig } from 'payload'

import { anyone, isStaffOrOwner } from '@/core/access'

import { linkField } from '../fields/link'

/** Footer menu: a list of links and an optional short text per language. No drafts. */
export const Footer: GlobalConfig = {
  slug: 'footer',
  access: { read: anyone, update: isStaffOrOwner },
  versions: false,
  fields: [
    { name: 'text', type: 'textarea', localized: true, admin: { description: 'Optional short text under the links.' } },
    { name: 'items', type: 'array', fields: [linkField('link')] },
  ],
}
