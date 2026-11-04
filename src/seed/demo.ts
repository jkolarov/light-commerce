import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type * as z from 'zod'

import { SeedError } from './errors'
import * as schema from './schema'
import type { DemoMedia, DemoMenus, DemoPage, DemoProduct, Localized } from './schema'

// Reads and checks all of demo/ before the seed writes anything: the shape of every file
// (schema.ts), and that every image, page and product it names exists.

export type DemoContent = {
  dir: string
  /** The home page first, then by file name. */
  pages: DemoPage[]
  /** In catalogue order. */
  products: DemoProduct[]
  media: DemoMedia[]
  menus: DemoMenus
  /** The footer's short line: the taglines in brand.md, or `null` when it has none. */
  footerText: Localized | null
}

/** Markdown links to pages and products: `[label](page:livraison)`, `[label](product:tilleul)`. */
export const MARKDOWN_LINK = /\[[^\]]*\]\((page|product):([^)\s]+)\)/g

/** `['layout', 0, 'link']` → `layout[0].link`. */
function formatPath(at: readonly PropertyKey[]): string {
  return at.map((key, i) => (typeof key === 'number' ? `[${key}]` : `${i === 0 ? '' : '.'}${String(key)}`)).join('')
}

function issueLines(file: string, issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.flatMap((issue) => {
    const where = (key?: PropertyKey) => `${file}: ${formatPath(key === undefined ? issue.path : [...issue.path, key]) || '(the whole file)'}`
    if (issue.code === 'unrecognized_keys') return issue.keys.map((key) => `${where(key)}: unknown field`)
    if (issue.code === 'invalid_type' && issue.input === undefined) return [`${where()}: is missing`]
    return [`${where()}: ${issue.message}`]
  })
}

/** Parses one JSON file of content/ with its schema; problems go to `problems`. */
function load<S extends z.ZodType>(dir: string, file: string, shape: S, problems: string[]): z.infer<S> | undefined {
  let data: unknown
  try {
    data = JSON.parse(readFileSync(path.join(dir, 'content', file), 'utf8'))
  } catch (error) {
    problems.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
  // `reportInput` lets the messages tell a missing field from a wrong one.
  const result = shape.safeParse(data, { reportInput: true })
  if (!result.success) {
    problems.push(...issueLines(file, result.error.issues))
    return undefined
  }
  return result.data
}

/** The taglines of brand.md (`- Tagline FR: *...*`), as the footer's short line. */
function readTaglines(dir: string): Localized | null {
  const file = path.join(dir, 'brand.md')
  if (!existsSync(file)) return null
  const brand = readFileSync(file, 'utf8')
  const tagline = (code: string) => brand.match(new RegExp(`^- Tagline ${code}: \\*(.+)\\*\\s*$`, 'm'))?.[1]
  const fr = tagline('FR')
  return fr ? { fr, ...(tagline('EN') ? { en: tagline('EN') } : {}) } : null
}

/** Checks that every image, page and product the content names exists. */
function checkReferences(dir: string, content: Omit<DemoContent, 'dir' | 'footerText'>, problems: string[]) {
  const photos = new Set(content.media.map((entry) => entry.file))
  const pageSlugs = new Set(content.pages.map((page) => page.slug.fr))
  const productSlugs = new Set(content.products.map((product) => product.slug))

  content.media.forEach((entry, i) => {
    if (!existsSync(path.join(dir, 'images', entry.file))) problems.push(`media.json: [${i}].file: images/${entry.file} does not exist`)
  })
  const image = (file: string, at: string, name: string | undefined) => {
    if (name !== undefined && !photos.has(name)) problems.push(`${file}: ${at}: "${name}" is not in media.json`)
  }
  const target = (file: string, at: string, type: 'page' | 'product', slug: string) => {
    if (!(type === 'page' ? pageSlugs : productSlugs).has(slug)) problems.push(`${file}: ${at}: no ${type} "${slug}" in the demo`)
  }
  const markdown = (file: string, at: string, value: Localized) => {
    for (const [locale, md] of Object.entries(value)) {
      for (const [, type, slug] of md?.matchAll(MARKDOWN_LINK) ?? []) target(file, `${at}.${locale}`, type as 'page' | 'product', slug!)
    }
  }

  for (const page of content.pages) {
    const file = `pages/${page.file}.json`
    if (page.slug.fr !== page.file) problems.push(`${file}: slug.fr: "${page.slug.fr}" must match the file name (${page.file})`)
    image(file, 'seo.image', page.seo.image)
    page.layout.forEach((block, i) => {
      const at = `layout[${i}]`
      if ('image' in block) image(file, `${at}.image`, block.image)
      if ('link' in block && block.link) target(file, `${at}.link.slug`, block.link.type, block.link.slug)
      if ('content' in block) markdown(file, `${at}.content`, block.content)
      if (block.blockType === 'productGrid') block.products.forEach((slug, j) => target(file, `${at}.products[${j}]`, 'product', slug))
    })
  }
  content.products.forEach((product, i) => {
    product.images.forEach((name, j) => image('products.json', `[${i}].images[${j}]`, name))
    markdown('products.json', `[${i}].description`, product.description)
  })
  for (const menu of ['header', 'footer'] as const) {
    content.menus[menu].forEach((link, i) => target('menus.json', `${menu}[${i}].slug`, link.type, link.slug))
  }
  const duplicates = (file: string, values: string[]) =>
    values.filter((value, i) => values.indexOf(value) !== i).forEach((value) => problems.push(`${file}: "${value}" appears twice`))
  duplicates('media.json', content.media.map((entry) => entry.file))
  duplicates('products.json', content.products.map((product) => product.slug))
  duplicates('pages/', content.pages.flatMap((page) => (page.slug.en ? [page.slug.en] : [])))
}

/** Reads demo/ (or a copy of it), or throws a `SeedError` listing every problem with its file and field. */
export function readDemo(dir: string): DemoContent {
  if (!existsSync(path.join(dir, 'content', 'pages'))) {
    throw new SeedError(`No demo content at ${dir}: expected content/ and images/ there (see demo/README.md).`)
  }
  const problems: string[] = []
  const files = readdirSync(path.join(dir, 'content', 'pages'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort((a, b) => (a === 'home' ? -1 : b === 'home' ? 1 : a.localeCompare(b)))
  const pages = files.flatMap((file) => {
    const data = load(dir, `pages/${file}.json`, schema.page, problems)
    return data ? [{ ...data, file }] : []
  })
  const products = load(dir, 'products.json', schema.products, problems) ?? []
  const media = load(dir, 'media.json', schema.media, problems) ?? []
  const menus = load(dir, 'menus.json', schema.menus, problems) ?? { header: [], footer: [] }
  if (!problems.length) checkReferences(dir, { pages, products, media, menus }, problems)
  if (problems.length) throw new SeedError(`The demo content in ${dir} has problems (shape in demo/README.md):`, problems)
  return { dir, pages, products, media, menus, footerText: readTaglines(dir) }
}
