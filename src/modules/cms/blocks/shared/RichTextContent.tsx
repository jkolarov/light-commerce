import type {
  DefaultNodeTypes,
  SerializedAutoLinkNode,
  SerializedHeadingNode,
  SerializedLinkNode,
  SerializedListItemNode,
  SerializedListNode,
  SerializedParagraphNode,
  SerializedQuoteNode,
} from '@payloadcms/richtext-lexical'
import type { SerializedEditorState, SerializedLexicalNode } from '@payloadcms/richtext-lexical/lexical'
import {
  type JSXConverterArgs,
  type JSXConverters,
  type JSXConvertersFunction,
  RichText as LexicalRichText,
} from '@payloadcms/richtext-lexical/react'

import type { Locale } from '@/core/i18n/locales'

import { richTextLinkHref } from './richTextLinks'
import { textLink } from './styles'

// Lexical rich text drawn with the theme's type: Payload's JSX converter, with our own converters
// for the nodes the blocks' editor makes (see `richTextField.ts`).

type Props = {
  /** The rich text field's value. */
  data: unknown
  locale: Locale
  className?: string
}

type Args<T extends { type?: string }> = JSXConverterArgs<T>

const headingClass = {
  h2: 'mt-14 font-heading text-[1.75rem] font-light leading-[1.15] tracking-[-0.01em] text-balance sm:text-[2.125rem]',
  h3: 'mt-10 font-heading text-[1.3125rem] font-normal leading-[1.25] sm:text-[1.5rem]',
  h4: 'mt-8 font-heading text-[1.125rem] font-medium leading-[1.3]',
} as const

function link({ node, nodesToJSX }: Args<SerializedLinkNode | SerializedAutoLinkNode>, locale: Locale) {
  const children = nodesToJSX({ nodes: node.children })
  const href = richTextLinkHref(node.fields, locale)
  // A link that goes nowhere keeps its words: they are part of the sentence.
  if (!href) return <>{children}</>
  const newTab = Boolean(node.fields?.newTab)
  return (
    <a href={href} className={textLink} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}>
      {children}
    </a>
  )
}

/** The text of a quote's last line when it is a sign-off: on its own line, starting with a dash (`— Hélène`). */
function signOffOf(nodes: SerializedLexicalNode[]): string | null {
  const last = nodes.at(-1) as { type?: string; text?: string } | undefined
  const line = last?.type === 'text' ? (last.text ?? '').trim() : ''
  return nodes.at(-2)?.type === 'linebreak' && /^[—–]\s?\S/.test(line) ? line : null
}

/** A quote in the heading font. Its sign-off line goes under it, in the body font. */
function quote({ node, nodesToJSX }: Args<SerializedQuoteNode>) {
  const nodes = node.children as SerializedLexicalNode[]
  const signOff = signOffOf(nodes)
  let body = signOff ? nodes.slice(0, -1) : nodes
  while (body.at(-1)?.type === 'linebreak') body = body.slice(0, -1)
  return (
    <figure className="my-10 border-l-2 border-text/15 pl-6 sm:pl-8">
      <blockquote className="font-heading text-[1.5rem] font-light italic leading-[1.35] sm:text-[1.75rem]">
        {nodesToJSX({ nodes: body })}
      </blockquote>
      {signOff && <figcaption className="mt-4 font-body text-base not-italic text-muted">{signOff}</figcaption>}
    </figure>
  )
}

function converters(locale: Locale): JSXConvertersFunction<DefaultNodeTypes> {
  return ({ defaultConverters }) => ({
    ...defaultConverters,
    paragraph: ({ node, nodesToJSX }: Args<SerializedParagraphNode>) => {
      const children = nodesToJSX({ nodes: node.children })
      // Empty paragraphs are the editor's way of adding space; the blocks own the spacing.
      if (!children.length) return null
      return <p className="mt-5">{children}</p>
    },
    heading: ({ node, nodesToJSX }: Args<SerializedHeadingNode>) => {
      // The hero's heading is the page's only h1: h1 becomes h2, and nothing goes below h4.
      const Tag = node.tag === 'h3' ? 'h3' : node.tag === 'h4' || node.tag === 'h5' || node.tag === 'h6' ? 'h4' : 'h2'
      return <Tag className={headingClass[Tag]}>{nodesToJSX({ nodes: node.children })}</Tag>
    },
    list: ({ node, nodesToJSX }: Args<SerializedListNode>) => {
      const children = nodesToJSX({ nodes: node.children })
      if (node.tag === 'ol') {
        return (
          <ol start={node.start > 1 ? node.start : undefined} className="mt-5 list-decimal space-y-3 pl-7 marker:font-heading marker:text-muted">
            {children}
          </ol>
        )
      }
      return <ul className="mt-5 list-disc space-y-2 pl-6 marker:text-muted">{children}</ul>
    },
    listitem: ({ node, nodesToJSX }: Args<SerializedListItemNode>) => (
      <li className="pl-1.5">{nodesToJSX({ nodes: node.children })}</li>
    ),
    quote,
    link: (args: Args<SerializedLinkNode>) => link(args, locale),
    autolink: (args: Args<SerializedAutoLinkNode>) => link(args, locale),
  }) as JSXConverters<DefaultNodeTypes>
}

function hasText(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const { text, children } = node as { text?: unknown; children?: unknown }
  if (typeof text === 'string' && text.trim()) return true
  return Array.isArray(children) && children.some(hasText)
}

/** Whether a rich text value has any words in it (an editor that was emptied keeps empty paragraphs). */
export function hasRichText(data: unknown): boolean {
  return hasText((data as SerializedEditorState | null | undefined)?.root)
}

/** Rich text in the theme's type. Nothing at all when there is no text. */
export function RichTextContent({ data, locale, className }: Props) {
  if (!hasRichText(data)) return null
  const state = data as SerializedEditorState
  return (
    <div className={`text-[1.0625rem] leading-[1.65] sm:text-lg [&>:first-child]:mt-0 ${className ?? ''}`}>
      <LexicalRichText<DefaultNodeTypes>
        data={state}
        converters={converters(locale)}
        disableContainer
        disableIndent
        disableTextAlign
      />
    </div>
  )
}
