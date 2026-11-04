import type { Locale } from '@/core/i18n/locales'
import type { CallToActionBlock } from '@/payload-types'

import { LinkButton } from '../shared/LinkButton'
import { blockSpacing, container, sectionHeading } from '../shared/styles'

type Props = CallToActionBlock & { locale: Locale }

// A quiet `surface` tile with a heading, a sentence and one button: on the right on wide screens,
// under the text on phones. Without a working link the tile still shows its words, never a broken button.
export function CallToAction({ heading, text, link, locale }: Props) {
  const sentence = text?.trim()
  return (
    <section className={`${container} ${blockSpacing}`}>
      <div className="flex flex-col items-start gap-7 rounded-[0.25rem] border border-text/10 bg-surface px-6 py-9 sm:px-10 sm:py-12 md:flex-row md:items-end md:justify-between md:gap-12 lg:px-14 lg:py-14">
        <div className="max-w-[36rem]">
          <h2 className={sectionHeading}>{heading}</h2>
          {sentence && <p className="mt-4 text-lg leading-[1.55] text-muted">{sentence}</p>}
        </div>
        <LinkButton link={link} locale={locale} className="shrink-0" />
      </div>
    </section>
  )
}
