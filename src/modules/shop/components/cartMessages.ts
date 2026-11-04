import { useTranslations } from 'next-intl'

import type { CartActionProblem } from '../cart/actions'

/** What to tell the visitor when a cart action was refused or failed. */
export function useCartProblemMessage(): (problem: CartActionProblem) => string {
  const t = useTranslations('cart')
  return (problem) => {
    switch (problem.kind) {
      case 'soldOut':
        return t('addSoldOut')
      case 'notEnoughStock':
        return t('addNotEnough', { count: problem.available })
      case 'unavailable':
        return t('addUnavailable')
      case 'tooMany':
        return t('addTooMany', { max: problem.max })
      case 'tooManyLines':
        return t('cartFull', { max: problem.max })
      default:
        return t('failed')
    }
  }
}
