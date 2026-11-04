import { renderToStaticMarkup as html } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Badge, Button, Container, Heading, Prose } from '@/theme'

describe('base components', () => {
  it('Container centres its content at the page width, as any element', () => {
    expect(html(<Container>x</Container>)).toMatch(/^<div class="mx-auto w-full max-w-\[76rem\] px-5 sm:px-8 lg:px-12">x<\/div>$/)
    expect(html(<Container as="section" width="narrow" className="py-8">x</Container>)).toMatch(/^<section class="[^"]*max-w-\[46rem\][^"]*py-8">/)
  })

  it('Heading picks its element from the level and its look from the size', () => {
    expect(html(<Heading level={1}>Titre</Heading>)).toMatch(/^<h1 class="[^"]*font-light[^"]*">Titre<\/h1>$/)
    expect(html(<Heading level={2} size="title">Petit</Heading>)).toMatch(/^<h2 class="[^"]*font-normal/)
    expect(html(<Heading level={3}>x</Heading>)).toMatch(/^<h3 /)
  })

  it('Prose wraps rich text in the prose styles', () => {
    expect(html(<Prose><p>Texte</p></Prose>)).toBe('<div class="lc-prose"><p>Texte</p></div>')
  })

  it('Button is a link with an href and a button without one, in two variants', () => {
    expect(html(<Button href="/fr/shop">Voir</Button>)).toMatch(/^<a class="[^"]*bg-primary[^"]*text-primary-contrast[^"]*" href="\/fr\/shop">Voir<\/a>$/)
    expect(html(<Button variant="secondary" type="submit">Envoyer</Button>)).toMatch(/^<button type="submit" class="[^"]*border-text\/60[^"]*">Envoyer<\/button>$/)
    expect(html(<Button>Ok</Button>)).toMatch(/^<button type="button" /)
  })

  it('Badge is a short label, neutral or in the accent colour', () => {
    expect(html(<Badge>Récolte 2026</Badge>)).toMatch(/^<span class="[^"]*bg-surface[^"]*">Récolte 2026<\/span>$/)
    expect(html(<Badge tone="accent">Épuisé</Badge>)).toMatch(/text-primary/)
  })
})
