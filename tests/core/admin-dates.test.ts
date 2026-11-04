import { createRequire } from 'node:module'

import { importDateFNSLocale } from '@payloadcms/translations'
import { describe, expect, it } from 'vitest'

import { defineLightConfig } from '@/config'
import { adminConfig, ADMIN_DATE_FORMAT } from '@/core/admin'

import { validInput } from '../config/fixtures/validInput'

// Payload formats every admin date with date-fns, in the admin language, from one pattern
// (`admin.dateFormat`). The pattern uses date-fns' localized tokens, so FR and EN each get their
// own style. date-fns is Payload's dependency: it is loaded the way the admin UI loads it.
const { format } = createRequire(createRequire(import.meta.url).resolve('@payloadcms/ui'))('date-fns') as {
  format: (date: Date, pattern: string, options: { locale: unknown }) => string
}

const config = defineLightConfig(validInput())
// Noon UTC, so the date is the same in every timezone the tests may run in.
const moment = new Date('2026-11-04T12:32:00Z')

describe('admin date format', () => {
  it('is set on the admin config', () => {
    expect(adminConfig({ config }).dateFormat).toBe(ADMIN_DATE_FORMAT)
  })

  it('reads as a French date in the French admin', async () => {
    const locale = await importDateFNSLocale('fr')
    expect(format(moment, ADMIN_DATE_FORMAT, { locale })).toMatch(/^4 nov\. 2026, \d{2}:\d{2}$/)
  })

  it('reads as an English date in the English admin', async () => {
    const locale = await importDateFNSLocale('en')
    expect(format(moment, ADMIN_DATE_FORMAT, { locale })).toMatch(/^Nov 4, 2026, \d{1,2}:\d{2} (AM|PM)$/)
  })
})
