import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cx, focusRing } from './styles'

const base = `inline-flex min-h-11 items-center justify-center gap-2 rounded-[0.1875rem] px-5 py-2.5 text-[0.9375rem] font-semibold leading-tight transition-colors ${focusRing}`

const variants = {
  /** The one call to action of a view: filled with `primary`. */
  primary: 'bg-primary text-primary-contrast hover:bg-primary/88',
  /** Any other action: outlined, so `primary` stays rare. */
  secondary: 'border border-text/60 text-text hover:bg-surface',
}

type Common = { variant?: keyof typeof variants; className?: string; children: ReactNode }

type LinkProps = Common & { href: string }
type NativeButtonProps = Common & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

/**
 * A button, `primary` or `secondary`, at least 44 px tall for touch. With an `href` it is a link
 * (a page address starting with `/` goes through Next's client navigation); without one, a
 * `<button>` (`type="button"` unless you say otherwise).
 */
export function Button(props: LinkProps | NativeButtonProps) {
  const { variant = 'primary', className, children } = props
  const classes = cx(base, variants[variant], className)
  if (props.href !== undefined) {
    return props.href.startsWith('/') ? (
      <Link href={props.href} className={classes}>
        {children}
      </Link>
    ) : (
      <a href={props.href} className={classes}>
        {children}
      </a>
    )
  }
  const { variant: _variant, className: _className, children: _children, href: _href, type = 'button', ...rest } = props
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
