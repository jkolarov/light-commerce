import { useTranslations } from 'next-intl'

import { cx, focusRing } from '../components/styles'

/** The id of the page's `<main>`, which the skip link jumps to. */
export const MAIN_ID = 'main-content'

/** The first thing a keyboard reaches: jumps past the header to the page. Hidden until focused. */
export function SkipLink() {
  const t = useTranslations('nav')
  return (
    <a
      href={`#${MAIN_ID}`}
      className={cx(
        'sr-only rounded-[0.1875rem] bg-primary px-4 py-3 font-semibold text-primary-contrast',
        'focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50',
        focusRing,
      )}
    >
      {t('skipToContent')}
    </a>
  )
}
