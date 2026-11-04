import type { Locale } from '@/core/i18n/locales'
import type { RichTextBlock } from '@/payload-types'

import { hasRichText, RichTextContent } from '../shared/RichTextContent'
import { blockSpacing, container } from '../shared/styles'

type Props = RichTextBlock & { locale: Locale }

// Running text in a reading column (under 75 characters a line), on the page's left edge like the
// hero's heading. Nothing at all when the text is empty.
export function RichText({ content, locale }: Props) {
  if (!hasRichText(content)) return null
  return (
    <section className={`${container} ${blockSpacing}`}>
      <RichTextContent data={content} locale={locale} className="max-w-[40rem]" />
    </section>
  )
}
