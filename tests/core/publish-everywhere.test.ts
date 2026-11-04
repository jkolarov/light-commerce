import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { publishedOrStaff } from '@/core/access'
import { publishInEveryLocale } from '@/core/collections/publishEverywhere'

import { startPayload, type TestPayload } from '../support/payload'

// The shared rule pages and products publish by: a publish covers every language. Checked on a
// test-only collection, so it runs whichever modules are on.

type Note = { id: number; title?: string | null; _status?: unknown }

describe('publishInEveryLocale on a collection with localized drafts', () => {
  let test: TestPayload
  let payload: Payload

  // The test-only collection is not in the generated types.
  const notes = 'test-localized-notes' as 'pages'
  const create = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    payload.create({ collection: notes, data: data as never, locale: 'fr', overrideAccess: true, ...extra }) as unknown as Promise<Note>
  const update = (id: number, data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    payload.update({ collection: notes, id, data: data as never, locale: 'fr', overrideAccess: true, ...extra }) as unknown as Promise<Note>

  /** What an anonymous visitor reads in `locale`: the title, or `null` when it is not published there. */
  const visible = async (id: number, locale: 'fr' | 'en') => {
    const { docs } = await payload.find({ collection: notes, where: { id: { equals: id } }, locale, overrideAccess: false })
    return docs.length ? ((docs[0] as unknown as Note).title ?? '') : null
  }

  beforeAll(async () => {
    test = await startPayload(
      {},
      {
        extraCollections: [
          {
            slug: 'test-localized-notes',
            access: { read: publishedOrStaff },
            hooks: { beforeOperation: [publishInEveryLocale] },
            fields: [{ name: 'title', type: 'text', localized: true }],
            versions: { drafts: true },
          },
        ],
      },
    )
    payload = test.payload
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it('publishes every language from a create in one language, the default language filling the gaps', async () => {
    const note = await create({ title: 'Bonjour', _status: 'published' })
    expect([await visible(note.id, 'fr'), await visible(note.id, 'en')]).toEqual(['Bonjour', 'Bonjour'])
  })

  it('publishes every language from a one-language Publish of a draft', async () => {
    const note = await create({ title: 'Brouillon', _status: 'draft' }, { draft: true })
    expect(await visible(note.id, 'en')).toBeNull()
    await update(note.id, { _status: 'published' }, { locale: 'en' })
    expect([await visible(note.id, 'fr'), await visible(note.id, 'en')]).toEqual(['Brouillon', 'Brouillon'])
  })

  it('leaves draft saves alone', async () => {
    const note = await create({ title: 'Jamais publié', _status: 'draft' }, { draft: true })
    await update(note.id, { title: 'Toujours brouillon', _status: 'draft' }, { draft: true })
    expect([await visible(note.id, 'fr'), await visible(note.id, 'en')]).toEqual([null, null])
  })

  it('keeps an "Unpublish in English" until the next publish, which publishes every language again', async () => {
    const note = await create({ title: 'Retiré', _status: 'published' })
    // What the admin's "Unpublish in English" sends: `_status: 'draft'` for one locale, no draft flag.
    await update(note.id, { _status: 'draft' }, { locale: 'en' })
    expect([await visible(note.id, 'fr'), await visible(note.id, 'en')]).toEqual(['Retiré', null])
    await update(note.id, { title: 'Republié', _status: 'published' })
    expect([await visible(note.id, 'fr'), await visible(note.id, 'en')]).toEqual(['Republié', 'Republié'])
  })

  it('republishes every language when server code saves a published document without a status', async () => {
    const note = await create({ title: 'Publié', _status: 'published' })
    await update(note.id, { _status: 'draft' }, { locale: 'en' })
    await update(note.id, { title: 'Corrigé' })
    expect([await visible(note.id, 'fr'), await visible(note.id, 'en')]).toEqual(['Corrigé', 'Corrigé'])
  })

  it('publishes the latest saved text of every language, drafts included', async () => {
    const note = await create({ title: 'Publié', _status: 'published' })
    await update(note.id, { title: 'English draft', _status: 'draft' }, { locale: 'en', draft: true })
    expect(await visible(note.id, 'en')).toBe('Publié')
    await update(note.id, { title: 'Republié', _status: 'published' })
    expect([await visible(note.id, 'fr'), await visible(note.id, 'en')]).toEqual(['Republié', 'English draft'])
  })

  it('unpublishes every language with unpublishAllLocales', async () => {
    const note = await create({ title: 'Partout', _status: 'published' })
    await update(note.id, { _status: 'draft' }, { unpublishAllLocales: true })
    expect([await visible(note.id, 'fr'), await visible(note.id, 'en')]).toEqual([null, null])
  })
})
