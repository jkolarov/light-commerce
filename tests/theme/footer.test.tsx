import { describe, expect, it } from 'vitest'

import { SiteFooter, type SiteFooterProps } from '@/theme/layout/SiteFooter'

import { hrefs, render } from './render'

const props: SiteFooterProps = {
  locale: 'fr',
  locales: ['fr', 'en'],
  siteName: 'Les Claies',
  logo: '/logo.svg',
  contactEmail: 'bonjour@lesclaies.example',
  nav: [
    { label: 'La ferme', href: '/fr/la-ferme' },
    { label: 'Mentions légales et CGV', href: '/fr/mentions-legales' },
  ],
  text: 'Quartier de Combe-Rousse\n26510 Montaurel',
  year: 2026,
}

describe('SiteFooter', () => {
  it('shows the footer menu, the text, the contact email and the small print', () => {
    const html = render(<SiteFooter {...props} />)
    expect(html).toContain('<footer')
    expect(html).toContain('aria-label="Pied de page"')
    expect(hrefs(html)).toEqual(['/fr', '/fr/la-ferme', '/fr/mentions-legales', 'mailto:bonjour@lesclaies.example', '/en'])
    expect(html).toContain('>Mentions légales et CGV<')
    // A textarea's line breaks are kept by CSS, never turned into HTML.
    expect(html).toContain('Quartier de Combe-Rousse\n26510 Montaurel')
    expect(html).toContain('whitespace-pre-line')
    expect(html).toContain('© 2026 Les Claies')
  })

  it('escapes the footer text', () => {
    const html = render(<SiteFooter {...props} text={'<script>alert(1)</script>'} />)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('works with the CMS off: logo, contact email, small print', () => {
    const html = render(<SiteFooter {...props} nav={[]} text={null} />)
    expect(html).not.toContain('aria-label="Pied de page"')
    expect(hrefs(html)).toEqual(['/fr', 'mailto:bonjour@lesclaies.example', '/en'])
    expect(html).toContain('© 2026 Les Claies')
  })

  it('uses English strings on English pages', () => {
    const html = render(<SiteFooter {...props} locale="en" />, 'en')
    expect(html).toContain('aria-label="Footer"')
    expect(hrefs(html)[0]).toBe('/en')
  })
})
