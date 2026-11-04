import type { Locale } from '@/core/i18n/locales'

import { currentCart } from '../cart/current'
import { CartControl } from './CartControl'

export type CartButtonProps = { locale: Locale }

/**
 * The header's cart (the locale layout draws it when the shop is on): a link to the cart page
 * with the item count, and the cart drawer. Reads the visitor's cart from its cookie.
 */
export async function CartButton({ locale }: CartButtonProps) {
  return <CartControl locale={locale} cart={await currentCart(locale)} />
}
