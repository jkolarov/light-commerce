import type { Access, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { isOwner, isStaffOrOwner } from '../access'

// True while the users collection is empty: the admin's create-first-user screen is the only
// way in, and it is the only anonymous create we allow.
async function noUsersYet(req: Parameters<Access>[0]['req']): Promise<boolean> {
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true, req })
  return totalDocs === 0
}

// The first user is always an owner, whatever the request says. Later users default to staff.
const firstUserIsOwner: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  if (await noUsersYet(req)) return { ...data, roles: ['owner'] }
  // Not `required` in the schema, so callers can omit roles without a type error; never store none.
  if (!data?.roles?.length) return { ...data, roles: ['staff'] }
  return data
}

// Owners manage users. Staff see only their own record (the admin needs it). Nobody else sees any.
const readUsers: Access = ({ req }) => {
  if (isOwner({ req })) return true
  if (isStaffOrOwner({ req }) && req.user) return { id: { equals: req.user.id } }
  return false
}

// No public sign-up: only an owner creates users, except the very first one.
const createUsers: Access = async ({ req }) => isOwner({ req }) || (await noUsersYet(req))

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  access: {
    admin: ({ req }) => isStaffOrOwner({ req }),
    create: createUsers,
    read: readUsers,
    update: isOwner,
    delete: isOwner,
  },
  auth: true,
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['staff'],
      options: [
        { label: 'Owner', value: 'owner' },
        { label: 'Staff', value: 'staff' },
      ],
      saveToJWT: true,
      access: {
        // Only owners change roles. The first-user hook sets the owner role itself.
        create: isOwner,
        update: isOwner,
      },
    },
  ],
  hooks: { beforeValidate: [firstUserIsOwner] },
  versions: false,
}
