// HTML for emails, escaped by default. Every value put into an `html` template is escaped
// (`&`, `<`, `>`, quotes), whatever it is: a buyer's name, an address, a product name, a
// translated sentence that has one of them in it. Only another `html` template goes in as it is.
// So nothing the buyer typed can become a tag or an attribute, and no call site has to remember.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** `text` with the characters HTML gives a meaning to written as entities. */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPES[char]!)

/** HTML built by `html`: safe to put into another template as it is. */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value
  }
}

/** What a template takes: text (escaped), safe HTML, a list of either, or nothing (`null`, `false`). */
export type HtmlPart = SafeHtml | string | number | null | undefined | false | readonly HtmlPart[]

function partToHtml(part: HtmlPart): string {
  if (part === null || part === undefined || part === false) return ''
  if (part instanceof SafeHtml) return part.value
  if (Array.isArray(part)) return part.map(partToHtml).join('')
  return escapeHtml(String(part))
}

/** A template literal tag: html`<td>${name}</td>` escapes `name`. */
export function html(strings: TemplateStringsArray, ...values: HtmlPart[]): SafeHtml {
  let out = strings[0] ?? ''
  values.forEach((value, index) => {
    out += partToHtml(value) + (strings[index + 1] ?? '')
  })
  return new SafeHtml(out)
}
