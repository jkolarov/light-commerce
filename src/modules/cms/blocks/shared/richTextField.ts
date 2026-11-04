import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
} from '@payloadcms/richtext-lexical'
import type { RichTextField, RichTextFieldValidation } from 'payload'

// The rich text of the blocks: paragraphs, h2–h4 (the hero's heading is the page's h1), bold,
// italic, lists, quotes and links. Nothing the block components don't draw (no uploads, tables,
// code or alignment). Internal links point to pages only: the CMS knows how to build their URL,
// and the shop's pages are reached with a URL link (`/fr/shop/<slug>`).
export const blockRichTextEditor = lexicalEditor({
  features: [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    BoldFeature(),
    ItalicFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    LinkFeature({ enabledCollections: ['pages'] }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})

/**
 * Required in the default language only, like `requiredInDefaultLocale` for text. A custom
 * `validate` replaces the editor's own, so this hands over to it: the editor still checks the
 * nodes inside (link URLs, for example).
 */
export const richTextRequiredInDefaultLocale: RichTextFieldValidation = (value, options) => {
  const { req } = options
  const isDefault = !req.locale || req.locale === (req.payload.config.localization || undefined)?.defaultLocale
  const editor = options.editor
  if (!editor || typeof editor === 'function') throw new Error('The rich text field has no editor.')
  return editor.validate(value, { ...options, required: isDefault })
}

/** A localized rich text field with the blocks' editor, required in the default language. */
export function blockRichTextField(name = 'content'): RichTextField {
  return {
    name,
    type: 'richText',
    label: { en: 'Content', fr: 'Contenu' },
    localized: true,
    editor: blockRichTextEditor,
    validate: richTextRequiredInDefaultLocale,
  }
}
