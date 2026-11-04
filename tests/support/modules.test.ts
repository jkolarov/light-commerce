import { expect, it } from 'vitest'

import { getLightConfig } from '@/config'

import { describeWithCms, describeWithShop } from './modules'

// CI runs every test file in each setup (LIGHT_CI_MODULES). These run only where their module is on.
describeWithCms('describeWithCms', () => {
  it('runs only when the CMS is on', () => {
    expect(getLightConfig().modules.cms).toBe(true)
  })
})

describeWithShop('describeWithShop', () => {
  it('runs only when the shop is on', () => {
    expect(getLightConfig().modules.shop).toBe(true)
  })
})
