// A product is published in every language at once, like a page: it has one slug and is sold in
// every language, and a missing translation falls back to the default language. The rule is
// core's, shared with the pages (src/core/collections/publishEverywhere.ts).
//
// For products it also keeps sales safe: Payload's one-language publish builds the live row from a
// read of the whole document taken during the save, so it would write back the stock as it was at
// that moment, over a sale landing in between (liveStock.ts). The all-languages path writes only
// what the save gives it, and the save never gives it the stock.
export { publishInEveryLocale } from '@/core/collections/publishEverywhere'
