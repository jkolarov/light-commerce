'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** Whether a menu link points at the current page, or at a section the page is in. */
export function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname || !href.startsWith('/')) return false
  const path = href.split(/[?#]/)[0]?.replace(/\/+$/, '') ?? ''
  if (pathname === path) return true
  // A section: /fr/shop is current on /fr/shop/verveine. Not the home page, which every path is in.
  return path.split('/').length > 2 && pathname.startsWith(`${path}/`)
}

/** A menu link that says when it is the current page (`aria-current`, styled by `className`). */
export function NavLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const pathname = usePathname()
  return (
    <Link href={href} aria-current={isCurrent(pathname, href) ? 'page' : undefined} className={className}>
      {children}
    </Link>
  )
}
