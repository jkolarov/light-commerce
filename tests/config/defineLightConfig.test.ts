import { describe, expect, it } from 'vitest'

import { defineLightConfig, LightConfigError } from '@/config'

import { validInput } from './fixtures/validInput'

// These tests break the config on purpose, in ways its type would refuse.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/** Runs `defineLightConfig` on a (deliberately broken) input and returns the problems it lists. */
function problemsOf(change: (input: Loose) => void): string[] {
  const input: Loose = validInput()
  change(input)
  try {
    defineLightConfig(input)
  } catch (error) {
    expect(error).toBeInstanceOf(LightConfigError)
    return (error as LightConfigError).problems
  }
  throw new Error('expected defineLightConfig to throw a LightConfigError')
}

describe('defineLightConfig', () => {
  it('returns a valid config unchanged', () => {
    expect(defineLightConfig(validInput())).toEqual(validInput())
  })

  it('accepts a non-integer tax rate (French reduced VAT is 5.5 %)', () => {
    const input = validInput()
    input.shop!.displayTaxRate = 5.5
    expect(defineLightConfig(input).shop?.displayTaxRate).toBe(5.5)
  })

  it('accepts an email notice in some languages, or none', () => {
    const input = validInput()
    expect(defineLightConfig(input).email.notice).toBeUndefined()
    input.email.notice = { fr: 'Boutique de démonstration : rien n’est expédié.' }
    expect(defineLightConfig(input).email.notice).toEqual({ fr: 'Boutique de démonstration : rien n’est expédié.' })
    input.email.notice = { fr: 'Démonstration.', en: 'A demo.' }
    expect(defineLightConfig(input).email.notice).toEqual({ fr: 'Démonstration.', en: 'A demo.' })
  })

  it('accepts a config without a shop section when the shop is off', () => {
    const input = validInput()
    input.modules.shop = false
    delete input.shop
    expect(defineLightConfig(input).shop).toBeUndefined()
  })

  describe('lists each bad path in plain words', () => {
    it('a missing site name', () => {
      expect(problemsOf((c) => delete c.site.name)).toEqual(['site.name: is missing'])
    })

    it('an empty site name', () => {
      expect(problemsOf((c) => (c.site.name = '  '))).toEqual(['site.name: must not be empty'])
    })

    it('a colour that is not a CSS colour', () => {
      const [problem] = problemsOf((c) => (c.theme.colors.primary = 'mallow; color: red'))
      expect(problem).toMatch(/^theme\.colors\.primary: expected a hex colour or a CSS colour function/)
    })

    it('a named colour, with a message that says why', () => {
      const [problem] = problemsOf((c) => (c.theme.colors.primary = 'white'))
      expect(problem).toMatch(/^theme\.colors\.primary: expected a hex colour or a CSS colour function/)
    })

    it('an unknown locale', () => {
      const [problem] = problemsOf((c) => (c.locales.available = ['fr', 'de']))
      expect(problem).toMatch(/^locales\.available\[1\]: unknown locale "de", expected "fr" or "en"/)
    })

    it('a missing default locale', () => {
      expect(problemsOf((c) => delete c.locales.default)).toEqual(['locales.default: is missing'])
    })

    it('a missing fixed value', () => {
      expect(problemsOf((c) => delete c.shop.currency)).toEqual(['shop.currency: is missing'])
    })

    it('a default locale that is not in the available locales', () => {
      expect(
        problemsOf((c) => {
          c.locales.available = ['fr']
          c.locales.default = 'en'
        }),
      ).toEqual(['locales.default: "en" is not in locales.available'])
    })

    it('the shop on without a shop section', () => {
      expect(problemsOf((c) => delete c.shop)).toEqual([
        'shop: is missing, and it is required when modules.shop is true',
      ])
    })

    it('a negative flat shipping rate', () => {
      const [problem] = problemsOf((c) => (c.shop.shipping.flatRate = -490))
      expect(problem).toMatch(/^shop\.shipping\.flatRate: expected a whole number of cents, 0 or more/)
    })

    it('a flat shipping rate in euros instead of cents', () => {
      const [problem] = problemsOf((c) => (c.shop.shipping.flatRate = 4.9))
      expect(problem).toMatch(/^shop\.shipping\.flatRate: expected a whole number of cents, 0 or more/)
    })

    it('a tax rate outside 0–100', () => {
      const [problem] = problemsOf((c) => (c.shop.displayTaxRate = 120))
      expect(problem).toMatch(/^shop\.displayTaxRate: expected a percentage from 0 to 100/)
    })

    it('a country that is not an ISO 3166-1 alpha-2 code', () => {
      const [problem] = problemsOf((c) => (c.shop.shipping.countries = ['France']))
      expect(problem).toMatch(/^shop\.shipping\.countries\[0\]: expected a two-letter country code/)
    })

    it('a currency other than EUR', () => {
      expect(problemsOf((c) => (c.shop.currency = 'USD'))).toEqual([
        'shop.currency: expected "EUR", the only currency for now',
      ])
    })

    it('a bad email address', () => {
      expect(problemsOf((c) => (c.email.fromAddress = 'shop at example.com'))).toEqual([
        'email.fromAddress: expected an email address, like "hello@example.com"',
      ])
    })

    it('an email notice in a language the code does not know', () => {
      expect(problemsOf((c) => (c.email.notice = { de: 'Ein Demo.' }))).toEqual(['email.notice.de: unknown setting'])
    })

    it('an empty email notice', () => {
      expect(problemsOf((c) => (c.email.notice = { fr: '  ' }))).toEqual(['email.notice.fr: must not be empty'])
    })

    it('an email notice that is not one line per language', () => {
      expect(problemsOf((c) => (c.email.notice = 'A demo.'))).toEqual(['email.notice: expected one line per language, like { fr: "…", en: "…" }'])
    })

    it('an email notice too long for one line, or on several', () => {
      expect(problemsOf((c) => (c.email.notice = { en: 'x'.repeat(301) }))).toEqual(['email.notice.en: one short line: 300 characters at most'])
      expect(problemsOf((c) => (c.email.notice = { en: 'A demo.\nNothing is shipped.' }))).toEqual(['email.notice.en: one short line: no line breaks'])
    })

    it('a site URL that is not an http(s) URL', () => {
      const [problem] = problemsOf((c) => (c.site.url = 'shop.example.com'))
      expect(problem).toMatch(/^site\.url: expected a full http\(s\) URL/)
    })

    it('a logo outside public/', () => {
      const [problem] = problemsOf((c) => (c.theme.logo = '../secret.svg'))
      expect(problem).toMatch(/^theme\.logo: expected a path under public\//)
    })

    it('a value of the wrong type', () => {
      expect(problemsOf((c) => (c.site.indexable = 'no'))).toEqual(['site.indexable: expected true or false'])
    })

    it('an unknown setting (a typo)', () => {
      expect(problemsOf((c) => (c.theme.colours = {}))).toEqual(['theme.colours: unknown setting'])
    })

    it('both modules off', () => {
      const [problem] = problemsOf((c) => {
        c.modules = { cms: false, shop: false }
        delete c.shop
      })
      expect(problem).toMatch(/^modules: switch on at least one module/)
    })

    it('every problem at once, not just the first', () => {
      const problems = problemsOf((c) => {
        delete c.site.name
        c.theme.colors.primary = 'nope'
        c.locales.default = 'de'
        c.shop.shipping.flatRate = -1
      })
      expect(problems).toHaveLength(4)
      expect(problems.map((problem) => problem.split(':')[0])).toEqual([
        'site.name',
        'locales.default',
        'theme.colors.primary',
        'shop.shipping.flatRate',
      ])
    })
  })

  it('puts every problem in the error message, so the startup log shows them', () => {
    const input: Loose = validInput()
    delete input.site.name
    input.theme.colors.primary = 'nope'
    expect(() => defineLightConfig(input)).toThrow(
      /light\.config\.ts is not valid \(2 problems\):\n {2}- site\.name: is missing\n {2}- theme\.colors\.primary: expected a hex colour/,
    )
  })

  it('still checks a shop section that is present while the shop is off', () => {
    const problems = problemsOf((c) => {
      c.modules.shop = false
      c.shop.shipping.flatRate = -1
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^shop\.shipping\.flatRate:/)
  })
})

describe('a broken light.config.ts', () => {
  it('fails when it is imported, with the problems in the message', async () => {
    await expect(import('./fixtures/broken.light.config')).rejects.toThrow(
      /theme\.colors\.primary: expected a hex colour or a CSS colour function/,
    )
  })
})
