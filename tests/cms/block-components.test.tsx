import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { cmsBlocks } from '@/modules/cms/blocks'
import { CallToAction } from '@/modules/cms/blocks/CallToAction/Component'
import { cmsBlockComponents } from '@/modules/cms/blocks/components'
import { Hero } from '@/modules/cms/blocks/Hero/Component'
import { ImageText } from '@/modules/cms/blocks/ImageText/Component'
import { RichText } from '@/modules/cms/blocks/RichText/Component'
import { imageSources } from '@/modules/cms/blocks/shared/media'
import type { CallToActionBlock, HeroBlock, ImageTextBlock, RichTextBlock } from '@/payload-types'

import { describeWithCms } from '../support/modules'
import {
  BOLD,
  draftPage,
  heading,
  ITALIC,
  landscape,
  linebreak,
  list,
  pageLink,
  paragraph,
  publishedPage,
  quote,
  richText,
  small,
  text,
  urlLink,
} from './blocks.fixtures'

// Block components rendered to static HTML, from data shaped like a page read at depth 1.

const count = (html: string, pattern: RegExp) => html.match(new RegExp(pattern, 'g'))?.length ?? 0

describeWithCms('CMS block components', () => {
  it('has a component for every block config, and nothing else', () => {
    expect(Object.keys(cmsBlockComponents).sort()).toEqual(cmsBlocks.map((block) => block.slug).sort())
  })

  describe('hero', () => {
    const full: HeroBlock = {
      blockType: 'hero',
      heading: 'Des plantes à tisane cueillies à la ferme.',
      text: 'Tout pousse sur nos terrasses.',
      image: landscape,
      link: { type: 'page', label: 'Voir les tisanes', page: publishedPage('tisanes') as never },
    }

    it('renders the page title, the text, the photo variants and the button', () => {
      const html = renderToStaticMarkup(<Hero {...full} locale="fr" />)
      expect(count(html, /<h1/)).toBe(1)
      expect(html).toContain('Des plantes à tisane cueillies à la ferme.</h1>')
      expect(html).toContain('Tout pousse sur nos terrasses.')
      expect(html).toContain('href="/fr/tisanes"')
      expect(html).toContain('>Voir les tisanes</a>')
      // Width variants only (the og crop has another shape), with the intrinsic size against layout shift.
      expect(html).toContain(
        'srcSet="/api/media/file/farm-400x250.webp 400w, /api/media/file/farm-800x500.webp 800w, /api/media/file/farm-1920x1200.webp 1920w"',
      )
      expect(html).not.toContain('farm-1200x630')
      expect(html).toContain('src="/api/media/file/farm-1920x1200.webp"')
      expect(html).toMatch(/width="1920" height="1200"/)
      expect(html).toContain('alt="Des mains tiennent un bouquet de fleurs"')
      // The hero photo is the first thing on the page: load it first (React also preloads it).
      expect(html).toContain('loading="eager"')
      expect(html).toContain('fetchPriority="high"')
      expect(html).toContain('<link rel="preload" as="image" imageSrcSet=')
    })

    it('renders with the heading only', () => {
      const html = renderToStaticMarkup(<Hero blockType="hero" heading="Contact" image={7} locale="en" />)
      expect(html).toContain('Contact</h1>')
      expect(html).not.toContain('<img')
      expect(html).not.toContain('<a')
      expect(html).not.toContain('<p')
    })

    it('renders no button when the linked page is a draft, not loaded, gone, or the label is empty', () => {
      const links: HeroBlock['link'][] = [
        { type: 'page', label: 'Voir', page: draftPage('tisanes') as never },
        { type: 'page', label: 'Voir', page: 42 },
        { type: 'page', label: 'Voir', page: null },
        { type: 'url', label: 'Voir', url: 'javascript:alert(1)' },
        { type: 'page', label: '', page: publishedPage('tisanes') as never },
        { type: 'page' },
      ]
      for (const link of links) {
        const html = renderToStaticMarkup(<Hero {...full} link={link} locale="fr" />)
        expect(html, JSON.stringify(link)).not.toContain('<a')
        expect(html).toContain('<h1')
      }
    })
  })

  describe('richText', () => {
    const content = richText(
      heading('h2', 'De la terrasse au sachet'),
      paragraph(text('Nous cueillons '), text('à la main', BOLD), text(', le '), text('matin', ITALIC), text('.')),
      list('ol', [[text('La cueillette.')], [text('Le séchage.')]]),
      list('ul', [[text('Verveine')], [text('Tilleul')]]),
      heading('h3', 'Nous écrire'),
      paragraph(
        pageLink('la ferme', publishedPage('the-farm')),
        text(', '),
        pageLink('brouillon', draftPage('secret')),
        text(', '),
        pageLink('pas chargé', 99),
        text(', '),
        urlLink('le tilleul', '/en/shop/tilleul'),
        text(', '),
        urlLink('carte', 'https://example.com/map', true),
        text(', '),
        urlLink('écrire', 'mailto:bonjour@lesclaies.example'),
        text(', '),
        urlLink('piège', 'javascript:alert(1)'),
      ),
      quote(text('On attend que les bractées pâlissent.'), linebreak(), text('— Hélène')),
    )

    it('renders headings, lists, emphasis and a quote with its sign-off', () => {
      const html = renderToStaticMarkup(<RichText blockType="richText" content={content} locale="en" />)
      expect(html).toMatch(/<h2[^>]*>De la terrasse au sachet<\/h2>/)
      expect(html).toMatch(/<h3[^>]*>Nous écrire<\/h3>/)
      expect(html).toMatch(/<ol[^>]*><li[^>]*>La cueillette.<\/li><li[^>]*>Le séchage.<\/li><\/ol>/)
      expect(html).toMatch(/<ul[^>]*><li[^>]*>Verveine<\/li>/)
      expect(html).toContain('<strong>à la main</strong>')
      expect(html).toContain('<em>matin</em>')
      expect(html).toMatch(/<figure[^>]*><blockquote[^>]*>On attend que les bractées pâlissent.<\/blockquote><figcaption[^>]*>— Hélène<\/figcaption><\/figure>/)
    })

    it('builds page links in the page language and keeps safe URLs', () => {
      const html = renderToStaticMarkup(<RichText blockType="richText" content={content} locale="en" />)
      expect(html).toMatch(/<a [^>]*href="\/en\/the-farm"[^>]*>la ferme<\/a>/)
      expect(html).toMatch(/<a [^>]*href="\/en\/shop\/tilleul"[^>]*>le tilleul<\/a>/)
      expect(html).toMatch(/<a [^>]*href="https:\/\/example.com\/map"[^>]*target="_blank"[^>]*>carte<\/a>/)
      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).toMatch(/<a [^>]*href="mailto:bonjour@lesclaies.example"[^>]*>écrire<\/a>/)
    })

    it('keeps the words of a broken link but drops the link', () => {
      const html = renderToStaticMarkup(<RichText blockType="richText" content={content} locale="en" />)
      for (const words of ['brouillon', 'pas chargé', 'piège']) {
        expect(html).toContain(`, ${words}`)
        expect(html).not.toContain(`>${words}</a>`)
      }
      expect(html).not.toContain('javascript:')
      expect(html).not.toContain('href="#"')
      expect(count(html, /<a /)).toBe(4)
    })

    it('never adds a second h1 to the page', () => {
      const html = renderToStaticMarkup(
        <RichText blockType="richText" content={richText(heading('h1', 'Titre'))} locale="fr" />,
      )
      expect(html).not.toContain('<h1')
      expect(html).toMatch(/<h2[^>]*>Titre<\/h2>/)
    })

    it('renders nothing without text', () => {
      const empty: RichTextBlock[] = [
        { blockType: 'richText', content: null },
        { blockType: 'richText', content: richText() },
        { blockType: 'richText', content: richText(paragraph()) },
      ]
      for (const block of empty) expect(renderToStaticMarkup(<RichText {...block} locale="fr" />)).toBe('')
    })
  })

  describe('imageText', () => {
    const full: ImageTextBlock = {
      blockType: 'imageText',
      heading: 'Combe-Rousse, 650 mètres d’altitude',
      content: richText(paragraph(text('Nos terrasses regardent le sud.'))),
      image: landscape,
      imagePosition: 'right',
      caption: 'Le chemin des terrasses, en juillet',
    }

    it('renders the photo with its caption, the heading and the text', () => {
      const html = renderToStaticMarkup(<ImageText {...full} locale="fr" />)
      expect(html).toMatch(/<h2[^>]*>Combe-Rousse, 650 mètres d’altitude<\/h2>/)
      expect(html).toContain('Nos terrasses regardent le sud.')
      expect(html).toMatch(/<figcaption[^>]*>Le chemin des terrasses, en juillet<\/figcaption>/)
      expect(html).toContain('/api/media/file/farm-800x500.webp 800w')
      expect(html).toContain('loading="lazy"')
      expect(html).toContain('alt="Des mains tiennent un bouquet de fleurs"')
      expect(html).toContain('data-image-position="right"')
      // Phones show the photo above the text: it comes first in the markup, on both sides.
      expect(html.indexOf('<img')).toBeLessThan(html.indexOf('Nos terrasses'))
      const left = renderToStaticMarkup(<ImageText {...full} imagePosition="left" locale="fr" />)
      expect(left).toContain('data-image-position="left"')
      expect(left.indexOf('<img')).toBeLessThan(left.indexOf('Nos terrasses'))
    })

    it('renders with the text only', () => {
      const html = renderToStaticMarkup(
        <ImageText blockType="imageText" content={full.content} image={3} imagePosition="left" locale="fr" />,
      )
      expect(html).toContain('Nos terrasses regardent le sud.')
      expect(html).not.toContain('<img')
      expect(html).not.toContain('<figcaption')
      expect(html).not.toContain('<h2')
    })
  })

  describe('callToAction', () => {
    const full: CallToActionBlock = {
      blockType: 'callToAction',
      heading: 'Pour offrir',
      text: 'Le coffret réunit quatre tisanes.',
      link: { type: 'url', label: 'Voir le coffret', url: '/fr/shop/coffret-quatre-tisanes' },
    }

    it('renders the heading, the text and the button', () => {
      const html = renderToStaticMarkup(<CallToAction {...full} locale="fr" />)
      expect(html).toMatch(/<h2[^>]*>Pour offrir<\/h2>/)
      expect(html).toContain('Le coffret réunit quatre tisanes.')
      expect(html).toMatch(/<a [^>]*href="\/fr\/shop\/coffret-quatre-tisanes"[^>]*>Voir le coffret<\/a>/)
    })

    it('renders with the heading and the button only', () => {
      const html = renderToStaticMarkup(
        <CallToAction blockType="callToAction" heading="Venir" link={{ type: 'page', label: 'Contact', page: publishedPage('contact') as never }} locale="en" />,
      )
      expect(html).toContain('href="/en/contact"')
      expect(html).not.toContain('<p')
    })

    it('renders no button for a page that is not published', () => {
      const html = renderToStaticMarkup(
        <CallToAction {...full} link={{ type: 'page', label: 'Contact', page: draftPage('contact') as never }} locale="fr" />,
      )
      expect(html).toContain('Pour offrir')
      expect(html).not.toContain('<a')
    })
  })

  describe('image sources', () => {
    it('lists each width once, smallest first, without the og crop', () => {
      expect(imageSources(landscape).map((s) => s.width)).toEqual([400, 800, 1920])
    })

    it('keeps one source for a photo smaller than every variant, and the original without variants', () => {
      expect(imageSources(small)).toEqual([{ url: '/api/media/file/small-300x200.webp', width: 300, height: 200 }])
      expect(imageSources({ ...landscape, variants: undefined })).toEqual([
        { url: '/api/media/file/farm.jpg', width: 2000, height: 1250 },
      ])
      const html = renderToStaticMarkup(<Hero blockType="hero" heading="x" image={small} locale="fr" />)
      expect(html).not.toContain('srcSet')
      expect(html).toContain('width="300" height="200"')
    })
  })
})
