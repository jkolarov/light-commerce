import { getLightConfig, type ShopConfig } from '@/config'

/**
 * The `shop` section of light.config.ts. The schema requires it whenever the shop is on, so the
 * shop's code can count on it; this throws only if the shop's code runs with the shop off.
 */
export function shopConfig(): ShopConfig {
  const { shop } = getLightConfig()
  if (!shop) throw new Error('The shop module is on but light.config.ts has no `shop` section.')
  return shop
}
