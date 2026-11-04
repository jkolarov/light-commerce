// Composes only: core + the module plugins. Modules register their own collections, globals,
// hooks and endpoints, so adding one never touches this file.
import { buildConfig } from 'payload'

import { getLightConfig } from './config'
import { coreConfig } from './core'
import { cmsPlugin } from './modules/cms'
import { shopPlugin } from './modules/shop'

const config = getLightConfig()

export default buildConfig({
  ...coreConfig({ config }),
  // Both modules are always on until S03 adds the switches from light.config.ts.
  plugins: [cmsPlugin({ config }), shopPlugin({ config })],
})
