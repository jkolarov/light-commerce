import { describe, expect, it } from 'vitest'

import { LanguageLinks } from '@/theme/layout/LanguageSwitch'
import { SiteHeader, type SiteHeaderProps } from '@/theme/layout/SiteHeader'
import { MAIN_ID, SkipLink } from '@/theme/layout/SkipLink'

import { hrefs, render } from './render'

const nav = [
  { label: 'Nos tisanes', href: '/fr/tisanes' },
  { label: 'La ferme', href: '/fr/la-ferme' },
  { label: 'Contact', href: '/fr/contact' },
]

const props: SiteHeaderProps = {
  locale: 'fr',
  locales: ['fr', 'en'],
  siteName: 'Les Claies',
  logo: '/logo.svg',
  nav,
  shop: true,
  cart: <span data-cart="">Panier (2)</span>,
}

describe('SiteHeader', () => {
  it('links the logo to the home page, with the site name as its text', () => {
    const html = render(<SiteHeader {...props} />)
    expect(html).toMatch(/<a [^>]*href="\/fr"[^>]*><img [^>]*src="\/logo.svg"[^>]*alt="Les Claies"/)
  })

  it('shows the menu links, then the shop, in the desktop menu and in the mobile menu', () => {
    const html = render(<SiteHeader {...props} />)
    const links = hrefs(html).filter((href) => /^\/fr\/(tisanes|la-ferme|contact|shop)$/.test(href))
    const order = ['/fr/tisanes', '/fr/la-ferme', '/fr/contact', '/fr/shop']
    expect(links).toEqual([...order, ...order])
    expect(html).toContain('>Boutique<')
    expect(html).toContain('aria-label="Menu principal"')
  })

  it('shows the cart the shop gives it', () => {
    expect(render(<SiteHeader {...props} />)).toContain('<span data-cart="">Panier (2)</span>')
  })

  it('has no shop link and no cart when the shop is off', () => {
    const html = render(<SiteHeader {...props} shop={false} cart={null} />)
    expect(html).not.toContain('/fr/shop')
    expect(html).not.toContain('Boutique')
    expect(html).not.toContain('Panier (2)')
  })

  it('does not repeat the shop link when the menu already has one', () => {
    const html = render(<SiteHeader {...props} nav={[...nav, { label: 'La boutique', href: '/fr/shop' }]} />)
    expect(html).not.toContain('>Boutique<')
    expect(hrefs(html).filter((href) => href === '/fr/shop')).toHaveLength(2)
  })

  it('has a menu button for small screens that controls the mobile menu', () => {
    const html = render(<SiteHeader {...props} />)
    const button = html.match(/<button [^>]*aria-expanded="false"[^>]*>/)?.[0] ?? ''
    expect(button).toContain('aria-controls="')
    const panelId = button.match(/aria-controls="([^"]+)"/)?.[1]
    expect(html).toMatch(new RegExp(`<div [^>]*id="${panelId}"[^>]*hidden=""`))
    expect(html).toContain('>Menu<')
  })

  it('works with the CMS off: logo, shop, language, nothing else', () => {
    const html = render(<SiteHeader {...props} nav={[]} />)
    expect(hrefs(html)).toEqual(['/fr', '/fr/shop', '/en', '/fr/shop', '/en'])
  })

  it('uses English strings on English pages', () => {
    const html = render(<SiteHeader {...props} locale="en" nav={[{ label: 'The farm', href: '/en/the-farm' }]} />, 'en')
    expect(html).toContain('>Shop<')
    expect(html).toContain('aria-label="Main menu"')
    expect(hrefs(html)).toContain('/en/shop')
  })
})

describe('LanguageLinks', () => {
  it('links each other language to the same path, with hreflang and its own name', () => {
    const html = render(<LanguageLinks label="Langue" locale="fr" locales={['fr', 'en']} pathname="/fr/a-propos" search="" />)
    expect(html).toContain('<a href="/en/a-propos" hrefLang="en" lang="en"')
    expect(html).toContain('>English</a>')
    // The current language is shown, not linked.
    expect(html).toMatch(/<span [^>]*aria-current="true"[^>]*lang="fr"[^>]*>Français<\/span>/)
    expect(html).not.toContain('href="/fr/a-propos"')
    expect(html).toContain('aria-label="Langue"')
  })

  it('keeps the query string', () => {
    const html = render(<LanguageLinks label="Language" locale="en" locales={['fr', 'en']} pathname="/en/order/4" search="token=t0k" />)
    expect(hrefs(html)).toEqual(['/fr/order/4?token=t0k'])
  })

  it('shows nothing when the site has one language', () => {
    expect(render(<LanguageLinks label="Langue" locale="fr" locales={['fr']} pathname="/fr" search="" />)).toBe('')
  })
})

describe('SkipLink', () => {
  it('jumps to the main area, in the page language', () => {
    expect(render(<SkipLink />)).toMatch(new RegExp(`^<a href="#${MAIN_ID}" class="sr-only [^"]*focus:not-sr-only[^"]*">Aller au contenu</a>$`))
    expect(render(<SkipLink />, 'en')).toContain('>Skip to content</a>')
  })
})
