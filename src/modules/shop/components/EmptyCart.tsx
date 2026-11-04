import { useTranslations } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'
import { Button, cx } from '@/theme'

import { shopPath } from '../products/paths'

/** An empty cart: says so, and points to the shop. */
export function EmptyCart({ locale, compact = false, className }: { locale: Locale; compact?: boolean; className?: string }) {
  const t = useTranslations('cart')
  return (
    <div className={className}>
      <p className={cx('font-heading text-text', compact ? 'text-2xl' : 'text-[1.75rem] leading-tight sm:text-[2rem]')}>{t('empty')}</p>
      <p className="mt-2 max-w-[42ch] text-muted">{t('emptyHint')}</p>
      <Button href={shopPath(locale)} className="mt-6">
        {t('goToShop')}
      </Button>
    </div>
  )
}
