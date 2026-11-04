import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import type { Field, Payload, RichTextField } from 'payload'

// Markdown (demo/README.md, "Markdown") to Lexical, with the editor of the field it is written to,
// so the result only holds nodes that field allows. `[label](page:<slug>)` and
// `[label](product:<slug>)` links are rewritten by the caller's `linkFields`.

export type LinkTarget = { type: 'page' | 'product'; slug: string }

/** Lexical link `fields` for a target, or `null` to keep the words without the link. */
export type LinkFieldsFor = (target: LinkTarget) => Record<string, unknown> | null

type LexicalNode = { type: string; children?: LexicalNode[]; fields?: { url?: unknown } & Record<string, unknown> }

/** The Lexical state Payload stores in a rich text field. */
export type LexicalState = { root: LexicalNode & { type: 'root' } }

const TARGET = /^(page|product):(.+)$/

/**
 * An empty `>` line inside a quote turns into a stray " >" at the end of the line before it, so
 * those lines go; "> text\n> — Name" still gives the quote with its sign-off on a new line.
 */
const dropEmptyQuoteLines = (markdown: string) =>
  markdown
    .split('\n')
    .filter((line) => !/^>\s*$/.test(line))
    .join('\n')

function rewriteLinks(nodes: LexicalNode[], linkFields: LinkFieldsFor): LexicalNode[] {
  return nodes.flatMap((node) => {
    const children = node.children && rewriteLinks(node.children, linkFields)
    const match = node.type === 'link' && typeof node.fields?.url === 'string' ? TARGET.exec(node.fields.url) : null
    if (!match) return [children ? { ...node, children } : node]
    const fields = linkFields({ type: match[1] as LinkTarget['type'], slug: match[2]! })
    // No target on this site (its module is off): the words stay, without the link.
    if (!fields) return children ?? []
    return [{ ...node, children, fields: { newTab: false, ...fields } }]
  })
}

const editorConfigs = new WeakMap<RichTextField, ReturnType<typeof editorConfigFactory.fromField>>()

export function markdownToLexical(args: { field: RichTextField; markdown: string; linkFields: LinkFieldsFor }): LexicalState {
  const { field, markdown, linkFields } = args
  let editorConfig = editorConfigs.get(field)
  if (!editorConfig) {
    editorConfig = editorConfigFactory.fromField({ field })
    editorConfigs.set(field, editorConfig)
  }
  const state = convertMarkdownToLexical({ editorConfig, markdown: dropEmptyQuoteLines(markdown) }) as unknown as LexicalState
  return { ...state, root: { ...state.root, children: rewriteLinks(state.root.children ?? [], linkFields) } }
}

const named = (fields: readonly Field[], name: string) => fields.find((field) => 'name' in field && field.name === name)

/**
 * A rich text field of the running config (sanitized: it carries its editor). `path` names the
 * field, through a blocks field and a block slug when needed: `['layout', 'richText', 'content']`.
 */
export function richTextField(payload: Payload, collection: string, path: readonly string[]): RichTextField {
  let fields: readonly Field[] = payload.collections[collection as keyof typeof payload.collections]?.config.fields ?? []
  for (let i = 0; i < path.length; i++) {
    const field = named(fields, path[i]!)
    if (field?.type === 'richText' && i === path.length - 1) return field
    if (field?.type === 'blocks') {
      const slug = path[++i]
      fields = field.blocks.find((block) => block.slug === slug)?.fields ?? []
    } else if (field && 'fields' in field) {
      fields = field.fields
    } else break
  }
  throw new Error(`No rich text field ${collection}.${path.join('.')} in the Payload config.`)
}
