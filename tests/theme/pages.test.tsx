import { describe, expect, it } from 'vitest'

import { ErrorView } from '@/theme/pages/ErrorView'
import { NotFoundView } from '@/theme/pages/NotFoundView'

import { hrefs, render } from './render'

describe('404 and error pages', () => {
  it('the 404 says what happened and links home, in the page language', () => {
    const fr = render(<NotFoundView />)
    expect(fr).toMatch(/<h1 [^>]*>Page introuvable<\/h1>/)
    expect(fr).toContain('Aucune page ne se trouve à cette adresse.')
    expect(hrefs(fr)).toEqual(['/fr'])
    const en = render(<NotFoundView />, 'en')
    expect(en).toMatch(/<h1 [^>]*>Page not found<\/h1>/)
    expect(hrefs(en)).toEqual(['/en'])
  })

  it('the error page offers a retry and the way home, never the error itself', () => {
    const html = render(<ErrorView retry={() => {}} />)
    expect(html).toMatch(/<h1 [^>]*>Cette page n’a pas pu s’afficher<\/h1>/)
    expect(html).toMatch(/<button type="button" [^>]*>Réessayer<\/button>/)
    expect(hrefs(html)).toEqual(['/fr'])
  })
})
