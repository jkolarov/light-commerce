import { describe, expect, it } from 'vitest'

import { GET } from '@/app/healthz/route'

describe('GET /healthz', () => {
  it('answers 200 with { ok: true }', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
