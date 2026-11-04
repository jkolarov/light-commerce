// Composes only: core + the module plugins that are on. Modules register their own collections,
// globals, hooks and endpoints, so adding one never touches this file.
import { buildConfig } from 'payload'

import { getLightConfig } from './config'
import { coreConfig } from './core'
import { cmsPlugin } from './modules/cms'
import { shopPlugin } from './modules/shop'

const config = getLightConfig()

export default buildConfig({
  ...coreConfig({ config }),
  plugins: [
    ...(config.modules.cms ? [cmsPlugin({ config })] : []),
    ...(config.modules.shop ? [shopPlugin({ config })] : []),
  ],
})
