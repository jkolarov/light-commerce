import type { Locale } from '@/core/i18n/locales'
import type { HeroBlock } from '@/payload-types'
import { MediaImage } from '@/theme'
import { asMedia } from '@/theme/media'

import { LinkButton, linkTarget } from '../shared/LinkButton'
import { container, displayHeading, photoFrame } from '../shared/styles'

type Props = HeroBlock & { locale: Locale }

// The page's visible title. The heading takes most of the width; the text and the button sit in a
// narrow column beside it on wide screens, under it on phones. The photo runs the full page width
// below, cropped a little wider on large screens so the next block stays in view.
export function Hero({ heading, text, image, link, locale }: Props) {
  const intro = text?.trim()
  const hasButton = linkTarget(link, locale) !== null
  return (
    <section className={`${container} pt-10 pb-6 sm:pt-16 sm:pb-8 lg:pt-20`}>
      <div className="grid gap-6 sm:gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
        {/* Required in the default language; a draft preview may still have none. */}
        {heading?.trim() && <h1 className={`${displayHeading} lg:col-span-8`}>{heading}</h1>}
        {(intro || hasButton) && (
          <div className="flex flex-col items-start gap-6 lg:col-span-4 lg:pb-2">
            {intro && <p className="max-w-[40ch] text-lg leading-[1.55] sm:text-xl sm:leading-[1.5]">{intro}</p>}
            <LinkButton link={link} locale={locale} />
          </div>
        )}
      </div>
      {asMedia(image) && (
        <div className={`${photoFrame} mt-8 sm:mt-12`}>
          <MediaImage
            media={image}
            priority
            sizes="(min-width: 76rem) 70rem, calc(100vw - 2.5rem)"
            className="aspect-[16/10] h-auto w-full object-cover lg:aspect-[2/1]"
          />
        </div>
      )}
    </section>
  )
}
