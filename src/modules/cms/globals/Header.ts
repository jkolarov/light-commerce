import type { GlobalConfig } from 'payload'

import { anyone, isStaffOrOwner } from '@/core/access'

import { linkField } from '../fields/link'

/** Header menu: up to 7 links, in order. No drafts: a saved menu is live. */
export const Header: GlobalConfig = {
  slug: 'header',
  access: { read: anyone, update: isStaffOrOwner },
  versions: false,
  fields: [
    {
      name: 'items',
      type: 'array',
      maxRows: 7,
      admin: { description: 'Up to 7 links, shown in this order.' },
      fields: [linkField('link')],
    },
  ],
}
