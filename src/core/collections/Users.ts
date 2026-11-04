import type { CollectionConfig } from 'payload'

// Admin users. Only what the admin needs to log in for now; S04 adds roles and access rules.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [],
  versions: false,
}
