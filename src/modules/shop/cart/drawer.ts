import { useSyncExternalStore } from 'react'

// Whether the cart drawer is open, shared by the components that open it (add to cart, the
// header's cart button) and the drawer itself. They sit in different parts of the page (the
// header is drawn by the locale layout, the product page by its route), so they meet here rather
// than through a provider. Browser only: the server always draws the drawer closed.

export type DrawerState = {
  open: boolean
  /** Said by screen readers when the drawer opens: "Added to your cart: …". */
  announcement: string | null
}

const closed: DrawerState = { open: false, announcement: null }
let state = closed
const listeners = new Set<() => void>()

function set(next: DrawerState) {
  state = next
  for (const listener of listeners) listener()
}

export function openCartDrawer(announcement: string | null = null) {
  set({ open: true, announcement })
}

export function closeCartDrawer() {
  if (state.open) set({ ...state, open: false })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCartDrawer(): DrawerState {
  return useSyncExternalStore(subscribe, () => state, () => closed)
}
