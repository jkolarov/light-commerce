import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { handleEndpoints } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPayload, type TestPayload } from '../support/payload'

const fixture = (name: string) => {
  const data = readFileSync(path.join(import.meta.dirname, '..', 'fixtures', name))
  return { data, mimetype: 'image/png', name, size: data.length }
}

describe('media collection', () => {
  let app: TestPayload
  let mediaDir: string

  beforeAll(async () => {
    mediaDir = mkdtempSync(path.join(tmpdir(), 'lc-media-'))
    app = await startPayload({ MEDIA_DIR: mediaDir })
  })
  afterAll(async () => {
    await app.stop()
    rmSync(mediaDir, { recursive: true, force: true })
  })

  const upload = (file: ReturnType<typeof fixture>, extra: object = {}) =>
    app.payload.create({
      collection: 'media',
      data: { alt: 'A test photo' },
      file,
      overrideAccess: true,
      ...extra,
    })

  it('stores the original at most 2400 px wide and makes the four WebP variants', async () => {
    const doc = await upload(fixture('photo-2600x1800.png'))
    expect(doc.width).toBe(2400)
    expect(doc.variants?.thumbnail?.width).toBe(400)
    expect(doc.variants?.card?.width).toBe(800)
    expect(doc.variants?.hero?.width).toBe(1920)
    expect(doc.variants?.og).toMatchObject({ width: 1200, height: 630 })
    for (const name of ['thumbnail', 'card', 'hero', 'og'] as const) {
      expect(doc.variants?.[name]?.mimeType).toBe('image/webp')
    }
  })

  it('does not upscale a small image', async () => {
    const doc = await upload(fixture('small-300x200.png'))
    expect(doc.width).toBe(300)
    // Variants that would be larger than the source keep the source size: nothing is upscaled.
    for (const name of ['thumbnail', 'card', 'hero', 'og'] as const) {
      expect(doc.variants?.[name]?.width, name).toBe(300)
      expect(doc.variants?.[name]?.height, name).toBe(200)
    }
  })

  it('requires alt text, localized', async () => {
    await expect(
      app.payload.create({
        collection: 'media',
        data: {} as never,
        file: fixture('small-300x200.png'),
        overrideAccess: true,
      }),
    ).rejects.toThrow()
    const doc = await upload(fixture('small-300x200.png'), { locale: 'fr', data: { alt: 'Une photo' } })
    await app.payload.update({
      collection: 'media',
      id: doc.id,
      data: { alt: 'A photo' },
      locale: 'en',
      overrideAccess: true,
    })
    const fr = await app.payload.findByID({ collection: 'media', id: doc.id, locale: 'fr' })
    const en = await app.payload.findByID({ collection: 'media', id: doc.id, locale: 'en' })
    expect([fr.alt, en.alt]).toEqual(['Une photo', 'A photo'])
  })

  it('rejects a file that is not an image', async () => {
    const data = Buffer.from('hello')
    await expect(
      upload({ data, mimetype: 'text/plain', name: 'note.txt', size: data.length }),
    ).rejects.toMatchObject({ data: { errors: [{ message: expect.stringMatching(/not allowed/) }] } })
    const pdf = Buffer.from('%PDF-1.4')
    await expect(
      upload({ data: pdf, mimetype: 'application/pdf', name: 'a.pdf', size: pdf.length }),
    ).rejects.toMatchObject({ data: { errors: [{ message: expect.stringMatching(/Invalid MIME type/) }] } })
  })

  it('rejects a file over 10 MB', async () => {
    const data = Buffer.concat([readFileSync(path.join(import.meta.dirname, '..', 'fixtures', 'small-300x200.png')), Buffer.alloc(10 * 1024 * 1024)])
    await expect(
      upload({ data, mimetype: 'image/png', name: 'big.png', size: data.length }),
    ).rejects.toThrow(/10 MB/)
  })

  it('accepts an SVG logo without variants', async () => {
    const data = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>',
    )
    const doc = await upload({ data, mimetype: 'image/svg+xml', name: 'logo.svg', size: data.length })
    expect(doc.mimeType).toBe('image/svg+xml')
    expect(doc.variants?.thumbnail?.url ?? null).toBeNull()
  })

  it('refuses an anonymous upload, lets anyone read', async () => {
    await expect(
      app.payload.create({
        collection: 'media',
        data: { alt: 'x' },
        file: fixture('small-300x200.png'),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const found = await app.payload.find({ collection: 'media', overrideAccess: false })
    expect(found.totalDocs).toBeGreaterThan(0)
  })

  describe('REST', () => {
    const post = (body: FormData, headers: Record<string, string> = {}) =>
      handleEndpoints({
        config: app.payload.config,
        path: '/api/media',
        request: new Request('http://localhost/api/media', { method: 'POST', body, headers }),
      })

    const png = () => {
      const f = fixture('small-300x200.png')
      return new Blob([new Uint8Array(f.data)], { type: 'image/png' })
    }

    it('refuses an anonymous multipart upload', async () => {
      const form = new FormData()
      form.set('_payload', JSON.stringify({ alt: 'x' }))
      form.set('file', png(), 'anon.png')
      const res = await post(form)
      expect([401, 403]).toContain(res.status)
    })

    it('answers 413 to a multipart body over 10 MB, before the user is looked at', async () => {
      const boundary = 'lc-boundary'
      const part = (head: string, body: Buffer) =>
        Buffer.concat([Buffer.from(`--${boundary}\r\n${head}\r\n\r\n`), body, Buffer.from('\r\n')])
      const body = Buffer.concat([
        part('Content-Disposition: form-data; name="_payload"', Buffer.from('{"alt":"x"}')),
        part(
          'Content-Disposition: form-data; name="file"; filename="big.png"\r\nContent-Type: image/png',
          Buffer.alloc(10 * 1024 * 1024 + 1024),
        ),
        Buffer.from(`--${boundary}--\r\n`),
      ])
      const res = await handleEndpoints({
        config: app.payload.config,
        path: '/api/media',
        request: new Request('http://localhost/api/media', {
          method: 'POST',
          body,
          headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        }),
      })
      expect(res.status).toBe(413)
    })

    it('serves a stored SVG with the script-blocking Content-Security-Policy', async () => {
      const data = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>',
      )
      const doc = await upload({ data, mimetype: 'image/svg+xml', name: 'csp.svg', size: data.length })
      const res = await handleEndpoints({
        config: app.payload.config,
        path: `/api/media/file/${doc.filename}`,
        request: new Request(`http://localhost/api/media/file/${doc.filename}`),
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('image/svg+xml')
      expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'none'")
      await res.arrayBuffer()
    })
  })
})
