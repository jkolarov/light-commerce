import { hiddenFromAdmin } from './admin'

// Carts: the plugin's own collection, for guests (reached with the cart's `secret`).
// Hidden from the admin; versions off, because every cart change would otherwise add one.
export const cartsOverride = hiddenFromAdmin
