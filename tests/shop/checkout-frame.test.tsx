import { describe, expect, it } from 'vitest'

import { CheckoutFrame, HIDE_SITE_HEADER } from '@/modules/shop/checkout/CheckoutFrame'

import { hrefs, render } from '../theme/render'

// The checkout's frame: its own header with the logo and a way back to the cart, and the rule that
// hides the site's header (and its menu) while the checkout is on the page. The locale layout
// draws `<header>` straight under `<body>`; the checkout's own header sits inside the frame.

const logo = { src: '/logo.svg', width: 160, height: 32 }
const colours = { danger: '#B42318', inputBorder: '#6A7068' }

describe('checkout frame', () => {
  const html = render(
    <CheckoutFrame locale="fr" siteName="Les Claies" logo={logo} colours={colours}>
      <p>Le formulaire</p>
    </CheckoutFrame>,
  )

  it('hides every header outside the checkout, only while the checkout is in the page', () => {
    expect(HIDE_SITE_HEADER).toBe('body:has([data-lc-checkout]) header:not([data-lc-checkout] header){display:none}')
    // One style element, deduplicated by React (href + precedence), with exactly that rule.
    const styles = [...html.matchAll(/<style\b([^>]*)>([^<]*)<\/style>/g)]
    expect(styles).toHaveLength(1)
    expect(styles[0]![1]).toMatch(/data-href="lc-checkout-frame"/)
    expect(styles[0]![2]).toBe(HIDE_SITE_HEADER)
  })

  it('wraps the page in the element the rule looks for, with its own header inside it', () => {
    expect(html).toMatch(/<div data-lc-checkout="" style="[^"]*--lc-checkout-danger:#B42318[^"]*"><header/)
    expect(html).toContain('<p>Le formulaire</p></div>')
    // The logo (home) and the way back to the cart: no menu.
    expect(hrefs(html)).toEqual(['/fr', '/fr/cart'])
    expect(html).not.toContain('<nav')
    expect(html).toContain('Retour au panier')
  })
})
