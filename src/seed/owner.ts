import type { SeedContext } from './context'
import type { SeedOwner } from './options'

/**
 * The owner account (SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD), created first: once a user exists,
 * the admin's create-first-user screen is closed. An existing account with that email is kept as
 * it is (its password too); it only gets the owner role if it lacks it. Users are never deleted.
 */
export async function ensureOwner(ctx: SeedContext, owner: SeedOwner): Promise<'created' | 'kept' | 'promoted'> {
  const { payload } = ctx
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: owner.email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existing = docs[0]
  if (!existing) {
    // `roles` explicitly: the first user becomes an owner anyway, a later one would default to staff.
    await payload.create({
      collection: 'users',
      data: { email: owner.email, password: owner.password, roles: ['owner'] },
      depth: 0,
      overrideAccess: true,
    })
    ctx.log(`Owner account ${owner.email}: created.`)
    return 'created'
  }
  if (existing.roles?.includes('owner')) {
    ctx.log(`Owner account ${owner.email}: already there, kept as it is.`)
    return 'kept'
  }
  await payload.update({
    collection: 'users',
    id: existing.id,
    data: { roles: [...(existing.roles ?? []), 'owner'] },
    depth: 0,
    overrideAccess: true,
  })
  ctx.log(`Owner account ${owner.email}: already there, now an owner.`)
  return 'promoted'
}
