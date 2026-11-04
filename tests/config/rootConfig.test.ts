import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// The entry point is the root file itself here, not `@/config`: light.config.ts and src/config
// import each other, and this proves that works in this order too.
import rootConfig from '../../light.config'

describe("the repo's own light.config.ts", () => {
  it('is valid (importing it would throw otherwise)', () => {
    expect(rootConfig.site.name).toBe('Les Claies')
  })

  it('describes the demo, hidden from search engines', () => {
    expect(rootConfig.site.indexable).toBe(false)
    expect(rootConfig.modules).toEqual({ cms: true, shop: true })
  })

  it('has the values the demo copy states (demo/README.md)', () => {
    expect(rootConfig.shop).toEqual({
      currency: 'EUR',
      pricesIncludeTax: true,
      displayTaxRate: 5.5,
      shipping: { flatRate: 490, countries: ['FR'] },
    })
  })

  it('points theme.logo at a file in public/', () => {
    expect(existsSync(path.join(process.cwd(), 'public', rootConfig.theme.logo))).toBe(true)
  })
})
