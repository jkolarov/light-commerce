import type {
  DefaultNodeTypes,
  SerializedAutoLinkNode,
  SerializedHeadingNode,
  SerializedLinkNode,
  SerializedParagraphNode,
  SerializedUploadNode,
} from '@payloadcms/richtext-lexical'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import {
  type JSXConverterArgs,
  type JSXConverters,
  type JSXConvertersFunction,
  RichText,
} from '@payloadcms/richtext-lexical/react'

import type { Locale } from '@/core/i18n/locales'
import { MediaImage, Prose } from '@/theme'

import { descriptionLinkHref } from './descriptionLinks'

// The product's description: Lexical rich text in the theme's running-text styles (`Prose`), with
// Payload's JSX converters and a few of our own.

type Args<T extends { type?: string }> = JSXConverterArgs<T>

function link({ node, nodesToJSX }: Args<SerializedLinkNode | SerializedAutoLinkNode>, locale: Locale) {
  const children = nodesToJSX({ nodes: node.children })
  const href = descriptionLinkHref(node.fields, locale)
  // A link that goes nowhere keeps its words: they are part of the sentence.
  if (!href) return <>{children}</>
  const newTab = Boolean(node.fields?.newTab)
  return (
    <a href={href} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}>
      {children}
    </a>
  )
}

function converters(locale: Locale): JSXConvertersFunction<DefaultNodeTypes> {
  return ({ defaultConverters }) => ({
    ...defaultConverters,
    paragraph: ({ node, nodesToJSX }: Args<SerializedParagraphNode>) => {
      const children = nodesToJSX({ nodes: node.children })
      // Empty paragraphs are the editor's way of adding space; the prose styles own the spacing.
      return children.length ? <p>{children}</p> : null
    },
    heading: ({ node, nodesToJSX }: Args<SerializedHeadingNode>) => {
      // The product's name is the page's only h1: the description's headings start at h2.
      const Tag = node.tag === 'h3' ? 'h3' : node.tag === 'h1' || node.tag === 'h2' ? 'h2' : 'h4'
      return <Tag>{nodesToJSX({ nodes: node.children })}</Tag>
    },
    link: (args: Args<SerializedLinkNode>) => link(args, locale),
    autolink: (args: Args<SerializedAutoLinkNode>) => link(args, locale),
    upload: ({ node }: Args<SerializedUploadNode>) => (
      <MediaImage media={node.value} sizes="(min-width: 64rem) 28rem, calc(100vw - 2.5rem)" className="h-auto w-full rounded-[0.25rem]" />
    ),
    // Anything else the default editor can hold (relationships, blocks) has no place on the page.
    unknown: () => null,
  }) as JSXConverters<DefaultNodeTypes>
}

function hasText(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const { text, children, type } = node as { text?: unknown; children?: unknown; type?: unknown }
  if (type === 'upload' || (typeof text === 'string' && text.trim())) return true
  return Array.isArray(children) && children.some(hasText)
}

/** The description in the theme's prose styles. Nothing at all when it has no text. */
export function ProductDescription({ data, locale, className }: { data: unknown; locale: Locale; className?: string }) {
  if (!hasText((data as SerializedEditorState | null | undefined)?.root)) return null
  return (
    <Prose className={className}>
      <RichText<DefaultNodeTypes>
        data={data as SerializedEditorState}
        converters={converters(locale)}
        disableContainer
        disableIndent
        disableTextAlign
      />
    </Prose>
  )
}
