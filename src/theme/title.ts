import type { Metadata } from 'next'

/**
 * Title rule for every public page: the site name appears once.
 *
 * The locale layout's title template adds " – <site name>" to a plain string title. An editor (or
 * the seeded content) may already have ended the title with the site name ("Nos tisanes – Les
 * Claies"). Such a title is used as-is through `title.absolute`, so the template does not double
 * it. Any other title is returned as a plain string and gets the template.
 */
export function pageTitle(title: string | null | undefined, siteName: string): Metadata['title'] {
  const text = title?.trim()
  if (!text) return undefined
  const name = siteName.trim().toLowerCase()
  const endsWithName = text.toLowerCase().endsWith(name) && text.length > name.length
  return endsWithName ? { absolute: text } : text
}

/** The plain text of a title built by `pageTitle`, for places that need a string (Open Graph). */
export function titleText(title: Metadata['title']): string | undefined {
  if (!title) return undefined
  if (typeof title === 'string') return title
  return 'absolute' in title ? title.absolute : undefined
}

/**
 * Title of a page that sits in the same route segment as the layout that defines the template
 * (the home page): Next applies a layout's template only to its child segments, so the home page
 * adds the site name itself, once, and uses the result through `title.absolute`.
 */
export function withSiteName(title: Metadata['title'], siteName: string): Metadata['title'] {
  const text = titleText(title)
  if (!text) return undefined
  return { absolute: typeof title === 'string' ? `${text} – ${siteName}` : text }
}
