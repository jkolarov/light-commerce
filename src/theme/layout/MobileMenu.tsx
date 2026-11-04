'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'

import { cx, focusRing } from '../components/styles'

type Props = {
  /** The button's text ("Menu"). It stays the same; `aria-expanded` says whether it is open. */
  label: string
  /** What the panel shows: the menu links and the language switch. */
  children: ReactNode
  className?: string
}

/**
 * The menu on small screens: a button that shows and hides a panel under the header (the
 * disclosure pattern). The panel closes on Escape (focus goes back to the button), on a click
 * outside it, when a link in it is followed, and whenever the page changes (Back included).
 * The header must be `relative`: the panel spans it.
 */
export function MobileMenu({ label, children, className }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Closes on every page change. Adjusting state while rendering, as React recommends for
  // state that follows a prop, rather than in an effect.
  const [shownOn, setShownOn] = useState(pathname)
  if (shownOn !== pathname) {
    setShownOn(pathname)
    setOpen(false)
  }
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const closeOnLink = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('a')) setOpen(false)
  }

  return (
    <div ref={root} className={className}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cx('-mr-2 inline-flex min-h-11 items-center gap-2 rounded-[0.1875rem] px-2 text-base text-text', focusRing)}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 7h14M3 13h14" />}
        </svg>
        <span>{label}</span>
      </button>
      <div
        id={id}
        hidden={!open}
        onClick={closeOnLink}
        className="absolute inset-x-0 top-full z-40 border-b border-text/15 bg-background shadow-[0_12px_24px_-16px_color-mix(in_oklab,var(--lc-color-text)_45%,transparent)]"
      >
        {children}
      </div>
    </div>
  )
}
