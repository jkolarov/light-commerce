import { hiddenFromAdmin } from './admin'

// Addresses: the plugin's saved addresses for customer accounts. The shop is guest-only, so
// nobody uses them (the shipping address lives on the transaction and the order). The plugin
// always creates the collection; it stays hidden.
export const addressesOverride = hiddenFromAdmin
