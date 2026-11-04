import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, expect, it } from 'vitest'

import type { Locale } from '@/core/i18n/locales'
import { cmsBlockComponents } from '@/modules/cms/blocks/components'
import { RenderBlocks } from '@/modules/cms/components/RenderBlocks'
import { lookupPage } from '@/modules/cms/pages/resolve'
import type { Media, Page } from '@/payload-types'

import { describeWithCms } from '../support/modules'
import { startPayload, type TestPayload } from '../support/payload'
import { heading, pageLink, paragraph, richText, text, urlLink } from './blocks.fixtures'

// The four CMS blocks on a real page: stored and read through the Local API, then rendered the
// way the page route renders them.

describeWithCms('CMS blocks on pages', () => {
  let app: TestPayload
  let payload: Payload
  let mediaDir: string
  let photo: Media
  let contactId: number

  const createPage = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    payload.create({ collection: 'pages', data: data as never, locale: 'fr', overrideAccess: true, ...extra })

  const publishAll = (id: number) =>
    payload.update({ collection: 'pages', id, data: { _status: 'published' }, publishAllLocales: true, locale: 'fr', overrideAccess: true })

  /** The page as an anonymous visitor gets it, rendered like the page route does. */
  const visit = async (slug: string, locale: Locale) => {
    const result = await lookupPage({ payload, locale, slug })
    if (result.kind !== 'page') throw new Error(`${slug} (${locale}): ${result.kind}`)
    const html = renderToStaticMarkup(<RenderBlocks blocks={result.page.layout} components={cmsBlockComponents} locale={locale} />)
    return { page: result.page, html }
  }

  beforeAll(async () => {
    mediaDir = mkdtempSync(path.join(tmpdir(), 'lc-blocks-media-'))
    app = await startPayload({ MEDIA_DIR: mediaDir })
    payload = app.payload
    const data = readFileSync(path.join(import.meta.dirname, '..', 'fixtures', 'photo-2600x1800.png'))
    photo = await payload.create({
      collection: 'media',
      data: { alt: 'Des mains tiennent des fleurs' },
      file: { data, mimetype: 'image/png', name: 'mains.png', size: data.length },
      locale: 'fr',
      overrideAccess: true,
    })
    await payload.update({ collection: 'media', id: photo.id, data: { alt: 'Hands holding flowers' }, locale: 'en', overrideAccess: true })
    const contact = await createPage({ title: 'Contact', slug: 'contact', _status: 'published' })
    contactId = contact.id
    await payload.update({
      collection: 'pages',
      id: contactId,
      data: { title: 'Get in touch', slug: 'get-in-touch', _status: 'published' },
      locale: 'en',
      overrideAccess: true,
    })
  }, 60_000)

  afterAll(async () => {
    await app.stop()
    rmSync(mediaDir, { recursive: true, force: true })
  })

  it('registers hero, richText, imageText and callToAction on the pages layout', () => {
    const pages = payload.config.collections.find((c) => c.slug === 'pages')!
    const layout = pages.fields.find((f) => 'name' in f && f.name === 'layout')
    expect(layout?.type).toBe('blocks')
    const slugs = layout?.type === 'blocks' ? layout.blocks.map((b) => b.slug) : []
    expect(slugs).toEqual(['hero', 'richText', 'imageText', 'callToAction'])
  })

  it('round-trips a page with every block, in French and in English', async () => {
    const created = await createPage({
      title: 'La ferme',
      slug: 'la-ferme',
      _status: 'published',
      layout: [
        { blockType: 'hero', heading: 'La ferme', text: 'Deux hectares en terrasses.', image: photo.id, link: { type: 'page', label: 'Nous écrire', page: contactId } },
        {
          blockType: 'richText',
          content: richText(
            heading('h2', 'Le séchoir'),
            paragraph(text('Écrivez-nous depuis la page '), pageLink('contact', contactId), text(' ou voyez '), urlLink('le tilleul', '/fr/shop/tilleul'), text('.')),
          ),
        },
        { blockType: 'imageText', heading: 'Combe-Rousse', content: richText(paragraph(text('Nos terrasses regardent le sud.'))), image: photo.id, imagePosition: 'right', caption: 'En juillet' },
        { blockType: 'callToAction', heading: 'Pour offrir', text: 'Le coffret réunit quatre tisanes.', link: { type: 'url', label: 'Voir le coffret', url: '/fr/shop/coffret' } },
      ],
    })

    // English text for the same blocks: the rows keep their ids, so the French stays.
    const ids = (created.layout ?? []).map((block) => block.id)
    await payload.update({
      collection: 'pages',
      id: created.id,
      locale: 'en',
      overrideAccess: true,
      data: {
        title: 'The farm',
        slug: 'the-farm',
        _status: 'published',
        layout: [
          { id: ids[0], blockType: 'hero', heading: 'The farm', text: 'Two hectares of terraces.', image: photo.id, link: { type: 'page', label: 'Write to us', page: contactId } },
          {
            id: ids[1],
            blockType: 'richText',
            content: richText(
              heading('h2', 'The drying room'),
              paragraph(text('Write to us from the '), pageLink('contact', contactId), text(' page or see '), urlLink('the linden', '/en/shop/tilleul'), text('.')),
            ),
          },
          { id: ids[2], blockType: 'imageText', heading: 'Combe-Rousse', content: richText(paragraph(text('Our terraces face south.'))), image: photo.id, imagePosition: 'right', caption: 'In July' },
          { id: ids[3], blockType: 'callToAction', heading: 'To give', text: 'The gift box holds four teas.', link: { type: 'url', label: 'See the gift box', url: '/en/shop/coffret' } },
        ] as Page['layout'],
      },
    })

    const french = await visit('la-ferme', 'fr')
    const [hero, rich, imageText, cta] = french.page.layout ?? []
    expect(hero).toMatchObject({ blockType: 'hero', heading: 'La ferme', link: { type: 'page', label: 'Nous écrire', page: { id: contactId, _status: 'published', slug: 'contact' } } })
    expect(hero?.blockType === 'hero' && typeof hero.image === 'object' && hero.image.variants?.hero?.width).toBe(1920)
    expect(rich?.blockType).toBe('richText')
    expect(imageText).toMatchObject({ blockType: 'imageText', imagePosition: 'right', caption: 'En juillet', image: { alt: 'Des mains tiennent des fleurs' } })
    expect(cta).toMatchObject({ blockType: 'callToAction', heading: 'Pour offrir', link: { type: 'url', url: '/fr/shop/coffret' } })

    expect(french.html).toContain('La ferme</h1>')
    expect(french.html).toMatch(/<a [^>]*href="\/fr\/contact"[^>]*>Nous écrire<\/a>/)
    expect(french.html).toMatch(/<a [^>]*href="\/fr\/contact"[^>]*>contact<\/a>/)
    expect(french.html).toMatch(/<a [^>]*href="\/fr\/shop\/tilleul"[^>]*>le tilleul<\/a>/)
    expect(french.html).toMatch(/<a [^>]*href="\/fr\/shop\/coffret"[^>]*>Voir le coffret<\/a>/)
    expect(french.html).toContain(`${hero?.blockType === 'hero' && typeof hero.image === 'object' ? hero.image.variants?.card?.url : 'missing'} 800w`)
    expect(french.html).toContain('alt="Des mains tiennent des fleurs"')

    const english = await visit('the-farm', 'en')
    expect(english.html).toContain('The farm</h1>')
    expect(english.html).toMatch(/<a [^>]*href="\/en\/get-in-touch"[^>]*>Write to us<\/a>/)
    expect(english.html).toMatch(/<a [^>]*href="\/en\/get-in-touch"[^>]*>contact<\/a>/)
    expect(english.html).toMatch(/<a [^>]*href="\/en\/shop\/coffret"[^>]*>See the gift box<\/a>/)
    expect(english.html).toContain('The drying room')
    expect(english.html).toMatch(/<figcaption[^>]*>In July<\/figcaption>/)
    expect(english.html).toContain('alt="Hands holding flowers"')
    expect(english.html).not.toContain('Nous écrire')
  })

  it('publishes in every language with French text only, and shows it in English', async () => {
    const page = await createPage({
      title: 'Livraison',
      _status: 'published',
      layout: [
        { blockType: 'hero', heading: 'Livraison et retours', image: photo.id },
        { blockType: 'richText', content: richText(paragraph(text('Les commandes partent le mardi.'))) },
        { blockType: 'imageText', content: richText(paragraph(text('Au séchoir.'))), image: photo.id, imagePosition: 'left' },
        { blockType: 'callToAction', heading: 'Une question ?', link: { type: 'page', label: 'Contact', page: contactId } },
      ],
    })
    await expect(publishAll(page.id)).resolves.toBeTruthy()
    const { html } = await visit('livraison', 'en')
    expect(html).toContain('Livraison et retours</h1>')
    expect(html).toContain('Les commandes partent le mardi.')
    expect(html).toMatch(/<a [^>]*href="\/en\/get-in-touch"[^>]*>Contact<\/a>/)
  })

  it('still requires the French text, the photos and the call to action link', async () => {
    const hero = { blockType: 'hero', heading: 'Titre', image: 0 }
    const content = richText(paragraph(text('Du texte.')))
    const invalid = [
      { blockType: 'hero', image: 0 },
      { blockType: 'hero', heading: 'Titre' },
      { blockType: 'richText', content: richText(paragraph()) },
      { blockType: 'richText' },
      { blockType: 'imageText', content, imagePosition: 'left' },
      { blockType: 'imageText', image: 0, imagePosition: 'left' },
      { blockType: 'callToAction', heading: 'Venir' },
      { blockType: 'callToAction', heading: 'Venir', link: { type: 'page', page: contactId } },
      { blockType: 'callToAction', link: { type: 'page', label: 'Contact', page: contactId } },
    ]
    for (const [index, block] of invalid.entries()) {
      const withPhoto = JSON.parse(JSON.stringify(block).replaceAll('"image":0', `"image":${photo.id}`))
      await expect(createPage({ title: `Invalide ${index}`, _status: 'published', layout: [withPhoto] }), JSON.stringify(block)).rejects.toThrow()
    }
    await expect(createPage({ title: 'Valide', _status: 'published', layout: [{ ...hero, image: photo.id }] })).resolves.toBeTruthy()
  })

  it('lets the hero go without a button, but not with half of one', async () => {
    const hero = (link?: unknown) => ({ blockType: 'hero', heading: 'Sans bouton', image: photo.id, ...(link ? { link } : {}) })
    await expect(createPage({ title: 'Sans lien', _status: 'published', layout: [hero()] })).resolves.toBeTruthy()
    await expect(createPage({ title: 'Lien vide', _status: 'published', layout: [hero({ type: 'url' })] })).resolves.toBeTruthy()
    await expect(createPage({ title: 'Sans page', _status: 'published', layout: [hero({ type: 'page', label: 'Voir' })] })).rejects.toThrow()
    await expect(createPage({ title: 'Sans label', _status: 'published', layout: [hero({ type: 'page', page: contactId })] })).rejects.toThrow()
    await expect(createPage({ title: 'Mauvaise URL', _status: 'published', layout: [hero({ type: 'url', label: 'x', url: 'javascript:alert(1)' })] })).rejects.toThrow()
    const { html } = await visit('sans-lien', 'fr')
    expect(html).toContain('Sans bouton</h1>')
    expect(html).not.toContain('<a')
  })

  it('drops the buttons and links to a page once it is unpublished', async () => {
    const target = await createPage({ title: 'Bientôt', _status: 'published' })
    await createPage({
      title: 'Avec liens',
      _status: 'published',
      layout: [
        { blockType: 'hero', heading: 'Avec liens', image: photo.id, link: { type: 'page', label: 'Bouton', page: target.id } },
        { blockType: 'richText', content: richText(paragraph(text('Voir '), pageLink('la suite', target.id), text('.'))) },
        { blockType: 'callToAction', heading: 'Suite', link: { type: 'page', label: 'Appel', page: target.id } },
      ],
    })
    expect(count((await visit('avec-liens', 'fr')).html, /href="\/fr\/bientot"/g)).toBe(3)

    await payload.update({ collection: 'pages', id: target.id, data: { _status: 'draft' }, overrideAccess: true })
    const { html } = await visit('avec-liens', 'fr')
    expect(html).not.toContain('bientot')
    expect(html).not.toContain('<a')
    expect(html).toContain('Voir la suite.')
    expect(html).toContain('Suite</h2>')
  })
})

function count(html: string, pattern: RegExp) {
  return html.match(pattern)?.length ?? 0
}
