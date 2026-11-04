import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@/config')
})

async function run(indexable: boolean, path: string) {
  vi.doMock('@/config', () => ({ getLightConfig: () => ({ site: { url: 'https://x.test', indexable } }) }))
  const { proxy } = await import('@/proxy')
  return proxy(new NextRequest(`http://localhost:3000${path}`))
}

describe('proxy noindex', () => {
  for (const path of ['/', '/admin', '/api/x']) {
    it(`sets X-Robots-Tag on ${path} when not indexable`, async () => {
      expect((await run(false, path)).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    })
    it(`sets nothing on ${path} when indexable`, async () => {
      expect((await run(true, path)).headers.get('x-robots-tag')).toBeNull()
    })
  }
})
