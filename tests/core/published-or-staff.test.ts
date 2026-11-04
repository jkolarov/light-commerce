import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { publishedOrStaff } from '@/core/access'
import type { User } from '@/payload-types'

import { startPayload, type TestPayload } from '../support/payload'

// A test-only collection with drafts, guarded by the helper, to check it through the real Local API.
describe('publishedOrStaff on a collection with drafts', () => {
  let test: TestPayload
  let payload: Payload
  let staff: User

  beforeAll(async () => {
    test = await startPayload(
      {},
      {
        extraCollections: [
          {
            slug: 'test-notes',
            access: { read: publishedOrStaff },
            fields: [{ name: 'title', type: 'text' }],
            versions: { drafts: true },
          },
        ],
      },
    )
    payload = test.payload
    staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@example.com', password: 'pw-staff-1', roles: ['staff'] },
      overrideAccess: true,
    })
    // @ts-expect-error test-only collection is not in the generated types
    await payload.create({ collection: 'test-notes', data: { title: 'draft', _status: 'draft' }, overrideAccess: true })
    // @ts-expect-error test-only collection is not in the generated types
    await payload.create({ collection: 'test-notes', data: { title: 'live', _status: 'published' }, overrideAccess: true })
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  const titles = async (user?: User) => {
    const res = await payload.find({
      // @ts-expect-error test-only collection is not in the generated types
      collection: 'test-notes',
      overrideAccess: false,
      user,
      draft: true,
      sort: 'title',
    })
    return (res.docs as { title: string }[]).map((d) => d.title)
  }

  it('shows anonymous visitors only the published document', async () => {
    expect(await titles()).toEqual(['live'])
  })

  it('shows staff both', async () => {
    expect(await titles(staff)).toEqual(['draft', 'live'])
  })
})
