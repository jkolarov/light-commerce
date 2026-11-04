import { describe } from 'vitest'

import { getLightConfig } from '@/config'

// CI runs the whole test suite in each setup: both modules, CMS only, shop only (LIGHT_CI_MODULES).
// Core tests run in every setup. A module's tests go inside one of these, so they are skipped
// in a setup where their module is off instead of failing on its missing collections.
//
//   describeWithCms('pages', () => { ... })
//
// The setup is read when the test file loads, from LIGHT_CI_MODULES or light.config.ts.

/** `describe` for tests of the cms module: skipped when the CMS is off. */
export const describeWithCms = describe.skipIf(!getLightConfig().modules.cms)

/** `describe` for tests of the shop module: skipped when the shop is off. */
export const describeWithShop = describe.skipIf(!getLightConfig().modules.shop)
