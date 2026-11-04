import { unstable_rethrow } from 'next/navigation'
import type { ReactNode } from 'react'

import { getLightConfig, type LightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import type { NavItem } from '@/core/types'

/** What the modules put in the page frame, for one request. */
export type Frame = {
  headerNav: NavItem[]
  footerNav: NavItem[]
  footerText: string | null
  shop: boolean
  /** The shop's `CartButton`, or `null` when the shop is off. */
  cart: ReactNode
}

/**
 * Reads the parts of the header and footer that come from the modules (plan, "What modules give
 * the public site"). A module's exports are imported only when it is on: with the CMS off there
 * are no CMS menus, with the shop off no cart. Module stories fill in their `frontend.ts`; this
 * file stays as it is.
 */
export async function loadFrame(locale: Locale, config: LightConfig = getLightConfig()): Promise<Frame> {
  const frame: Frame = { headerNav: [], footerNav: [], footerText: null, shop: config.modules.shop, cart: null }

  if (config.modules.cms) {
    const cms = await import('@/modules/cms/frontend')
    ;[frame.headerNav, frame.footerNav, frame.footerText] = await Promise.all([
      orWithout('header menu', () => cms.getHeaderNav(locale), []),
      orWithout('footer menu', () => cms.getFooterNav(locale), []),
      orWithout('footer text', () => cms.getFooterText(locale), null),
    ])
  }

  if (config.modules.shop) {
    const { CartButton } = await import('@/modules/shop/frontend')
    frame.cart = <CartButton locale={locale} />
  }

  return frame
}

/**
 * The layout sits outside the page's error boundary (error.tsx), so a menu that cannot be read
 * (database down, missing table) would take the whole site down with Next's bare error page.
 * Instead the frame is drawn without it, and the error is logged.
 */
async function orWithout<T>(what: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch (error) {
    unstable_rethrow(error)
    console.error(`Theme: could not read the ${what}; the page is shown without it.`, error)
    return fallback
  }
}
