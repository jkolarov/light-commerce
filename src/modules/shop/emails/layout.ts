import { getLightConfig } from '@/config'
import type { Locale } from '@/core/i18n/locales'
import { fontStack, shippedFamilies } from '@/theme/fonts/families'

import { html, type HtmlPart, type SafeHtml } from './html'

// The frame every order email shares, written the way email clients read HTML: nested tables for
// layout, inline styles only (no <style>, no class, no external CSS, no script, no web font), one
// column at most 600 px wide, in the theme's colours and fonts from light.config.ts. The site's
// name stands in for the logo (an SVG logo doesn't show in most clients).

/** The theme's colours and fonts, as email styles want them. */
function look() {
  const { colors, fonts } = getLightConfig().theme
  // Fonts aren't loaded in an email: the theme's family first, for a reader who has it, then its
  // fallbacks. Single quotes, because the stack goes into a double-quoted style attribute.
  const named = Object.fromEntries(shippedFamilies.map((family) => [family.name, `'${family.name}'`]))
  const stack = (value: string) => fontStack(value, named).replaceAll('"', "'")
  return { colors, heading: stack(fonts.heading), body: stack(fonts.body) }
}

/** A paragraph; `muted` for the small print. */
export function paragraph(content: HtmlPart, opts: { muted?: boolean } = {}): SafeHtml {
  const { colors } = look()
  const style = opts.muted ? `margin:0 0 12px;font-size:14px;line-height:1.5;color:${colors.muted};` : `margin:0 0 16px;font-size:16px;line-height:1.55;color:${colors.text};`
  return html`<p style="${style}">${content}</p>`
}

/** A heading inside the email (the email's own title is `title` in `emailDocument`). */
export function heading(text: string, opts: { size?: 'large' | 'small' } = {}): SafeHtml {
  const { colors, heading: font } = look()
  const size = opts.size === 'large' ? 'font-size:28px;line-height:1.15;font-weight:300;margin:0 0 16px;' : 'font-size:19px;line-height:1.3;font-weight:400;margin:28px 0 10px;'
  return html`<h2 style="${size}font-family:${font};color:${colors.text};">${text}</h2>`
}

/** A link styled as the theme's primary button (a table cell, so Outlook draws it too). */
export function button(href: string, label: string): SafeHtml {
  const { colors, body } = look()
  return html`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td bgcolor="${colors.primary}" style="background-color:${colors.primary};border-radius:4px;"><a href="${href}" style="display:inline-block;padding:12px 22px;font-family:${body};font-size:16px;font-weight:600;line-height:1.2;color:${colors.primaryContrast};text-decoration:none;border-radius:4px;">${label}</a></td></tr></table>`
}

/** A link in the theme's link colour. */
export function link(href: string, label: string): SafeHtml {
  return html`<a href="${href}" style="color:${look().colors.primary};text-decoration:underline;">${label}</a>`
}

/** `text`, with its first `needle` (an address in a sentence) as a link to `href`. */
export function linkWithin(text: string, needle: string, href: string): SafeHtml {
  const at = text.indexOf(needle)
  if (at < 0) return html`${text}`
  return html`${text.slice(0, at)}${link(href, needle)}${text.slice(at + needle.length)}`
}

/** A tinted box (the order summary, the owner's warning). */
export function box(content: HtmlPart, opts: { accent?: boolean } = {}): SafeHtml {
  const { colors } = look()
  const edge = opts.accent ? `border-left:4px solid ${colors.primary};` : ''
  return html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td style="background-color:${colors.surface};${edge}border-radius:4px;padding:18px 20px;">${content}</td></tr></table>`
}

/** Rows of a label and an amount, right-aligned; `strong` for the total. */
export function amountRows(rows: { label: string; value: string; strong?: boolean; separated?: boolean }[]): SafeHtml {
  const { colors, heading: font } = look()
  return html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map((row) => {
    const line = row.separated ? `border-top:1px solid ${colors.background};` : ''
    const value = row.strong ? `font-family:${font};font-size:22px;color:${colors.text};` : `font-size:16px;color:${colors.text};`
    return html`<tr><td style="${line}padding:8px 0;font-size:16px;color:${row.strong ? colors.text : colors.muted};${row.strong ? 'font-weight:600;' : ''}">${row.label}</td><td align="right" style="${line}padding:8px 0;white-space:nowrap;font-variant-numeric:tabular-nums;${value}">${row.value}</td></tr>`
  })}</table>`
}

/** One line of an order: the product's name and quantity, and its amount on the right. */
export function lineRow(name: string, detail: string, amount: string | null, first: boolean): SafeHtml {
  const { colors, heading: font } = look()
  const line = first ? '' : `border-top:1px solid ${colors.background};`
  return html`<tr><td style="${line}padding:10px 12px 10px 0;"><div style="font-family:${font};font-size:17px;line-height:1.3;color:${colors.text};">${name}</div><div style="font-size:14px;line-height:1.4;color:${colors.muted};">${detail}</div></td><td align="right" valign="top" style="${line}padding:10px 0;white-space:nowrap;font-size:16px;font-variant-numeric:tabular-nums;color:${colors.text};">${amount ?? ''}</td></tr>`
}

/** Lines of text, one per line (an address, a contact). */
export const textLines = (lines: string[]): SafeHtml => html`${lines.map((line, index) => html`${index ? html`<br>` : ''}${line}`)}`

/**
 * The whole email: the site's name on top, `body` on a card, a footer with `notice` (the site's
 * `email.notice`, when it has one) and the site's address. `preview` is the line inboxes show
 * after the subject (hidden in the email itself).
 */
export function emailDocument(parts: { lang: Locale; title: string; preview: string; body: SafeHtml; notice?: string | null }): string {
  const { site } = getLightConfig()
  const { colors, heading: headingFont, body: bodyFont } = look()
  return html`<!DOCTYPE html>
<html lang="${parts.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${parts.title}</title>
</head>
<body style="margin:0;padding:0;background-color:${colors.surface};color:${colors.text};font-family:${bodyFont};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${parts.preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.surface}" style="background-color:${colors.surface};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 8px 18px;font-family:${headingFont};font-size:26px;line-height:1.2;color:${colors.text};">${site.name}</td></tr>
<tr><td bgcolor="${colors.background}" style="background-color:${colors.background};border-radius:4px;padding:32px 28px;font-family:${bodyFont};font-size:16px;line-height:1.55;color:${colors.text};">
${parts.body}
</td></tr>
<tr><td style="padding:18px 8px 0;font-family:${bodyFont};font-size:13px;line-height:1.5;color:${colors.muted};">${parts.notice ? html`${parts.notice}<br>` : ''}${site.name} · ${link(site.url, new URL(site.url).host)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`.value
}
