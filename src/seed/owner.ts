import type { SeedContext } from './context'
import { SeedError } from './errors'
import { passwordProblem, type SeedOwner } from './options'

/**
 * The owner account (SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD), made sure of before anything else is
 * written or wiped: once a user exists, the admin's create-first-user screen is closed.
 *
 * - No account with that email: it is created as an owner, which needs a strong password.
 * - An account exists: it keeps its password (SEED_OWNER_PASSWORD may be unset, as on the nightly
 *   reset; a different one is not applied, change it in the admin). An account that isn't an owner
 *   becomes one, with a warning.
 *
 * Users are never deleted.
 */
export async function ensureOwner(ctx: SeedContext, owner: SeedOwner): Promise<'created' | 'kept' | 'promoted'> {
  const { payload } = ctx
  // Payload stores emails in lowercase.
  const email = owner.email.trim().toLowerCase()
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existing = docs[0]
  if (!existing) {
    const problem = owner.password === undefined ? 'SEED_OWNER_PASSWORD is not set: it is needed to create the owner account' : passwordProblem(owner.password)
    if (problem) throw new SeedError(`The seed cannot create the owner account ${email}:`, [problem])
    // `roles` explicitly: the first user becomes an owner anyway, a later one would default to staff.
    await payload.create({
      collection: 'users',
      data: { email, password: owner.password!, roles: ['owner'] },
      depth: 0,
      overrideAccess: true,
    })
    ctx.log(`Owner account ${email}: created.`)
    return 'created'
  }
  if (existing.roles?.includes('owner')) {
    ctx.log(`Owner account ${email}: already there, password not changed.`)
    return 'kept'
  }
  await payload.update({
    collection: 'users',
    id: existing.id,
    data: { roles: [...(existing.roles ?? []), 'owner'] },
    depth: 0,
    overrideAccess: true,
  })
  ctx.log(`Owner account ${email}: already there, password not changed.`)
  ctx.log(`Warning: ${email} was a ${existing.roles?.join(', ') || 'user'} account and is now an owner (SEED_OWNER_EMAIL).`)
  return 'promoted'
}
