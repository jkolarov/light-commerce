import { createTranslator } from 'next-intl'

import type { Locale } from '@/core/i18n/locales'

import en from '../../../../messages/en.json'
import fr from '../../../../messages/fr.json'

// The emails' words: the `email` namespace of messages/{fr,en}.json, like every public string.
// Emails are rendered outside a page (after the response, or in a script), where next-intl's
// request helpers have no request, so the files are read here and handed to `createTranslator`
// (next-intl's own, the same ICU syntax as the pages).

const messages = { fr, en } satisfies Record<Locale, unknown>

/** The `email` messages in `locale`. Values are text: escape them in HTML (./html.ts does). */
export const emailTranslator = (locale: Locale) => createTranslator({ locale, messages: messages[locale], namespace: 'email' })

export type EmailTranslator = ReturnType<typeof emailTranslator>
