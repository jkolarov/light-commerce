# Phase 1 finish line: walkthrough on the live demo

Done on 2026-11-04 on **https://lightcommerce.fluxory.dev**, through the Cloudflare tunnel, in headless Chromium (Playwright), with Stripe in test mode. The demo was then reset (`deploy/demo/reset.sh`), so it starts clean. Design section 2 asks for every step below.

## A visitor buys

| | |
|---|---|
| `/` answers `307` to `/fr`. The home page in French and in English, from the CMS, with the product grid block. | [01-home-fr](01-home-fr.png), [02-home-en](02-home-en.png) |
| The product list, and a product page in French and in English (price with VAT, stock, facts, gallery). | [03-shop-fr](03-shop-fr.png), [05-product-fr](05-product-fr.png), [10-product-en](10-product-en.png) |
| "Ajouter au panier" (a Server Action, through the tunnel: Next's Origin check accepts the forwarded host), then the cart page: 7,90 € + 4,90 € shipping. | [07-cart-fr](07-cart-fr.png) |
| The checkout: details, address, and Stripe's own Payment Element with the test card 4242 4242 4242 4242. | [08-checkout-fr](08-checkout-fr.png) |
| Pay: Stripe's real webhook reached `/api/payments/stripe/webhooks` through the tunnel and made order 1 (`Shop: webhook evt_…: order 1`); the browser landed on the order's page. | [09-confirmation-fr](09-confirmation-fr.png) |
| Exactly two emails, both in Mailpit (on the machine only, `127.0.0.1:8120`): the buyer's confirmation and the owner's notification. | [11-mailpit-inbox](11-mailpit-inbox.png), [12-email-buyer](12-email-buyer.png), [13-email-owner](13-email-owner.png) |

## The owner, in `/admin`

| | |
|---|---|
| Logs in as `proprietaire@lesclaies.example` (the password is only in `deploy/demo/.env` on the machine). | [14-admin-dashboard](14-admin-dashboard.png) |
| Sees the order in the list and opens it: 12,80 € = 7,90 € + 4,90 €, "Payée, à expédier". | [15-admin-orders](15-admin-orders.png), [16-admin-order](16-admin-order.png) |
| Edits a page: the hero heading of "La ferme", published in French; the public page shows it. | [17-admin-page-edit](17-admin-page-edit.png), [18-page-edited-fr](18-page-edited-fr.png) |
| Adds a product (name, summary, a photo from the library, stock 12, 8,50 €) and publishes it: it is in the shop. | [19-admin-product-new](19-admin-product-new.png), [20-shop-with-new-product](20-shop-with-new-product.png) |
| Changes stock: Tilleul to 3; its page says "Plus que 3 en stock". | [21-admin-stock](21-admin-stock.png), [22-product-low-stock-fr](22-product-low-stock-fr.png) |

## Then the nightly reset

`deploy/demo/reset.sh`, by hand: deleted 1 order, 1 transaction, 1 cart and the added product, set the stock back to the demo's numbers and the page text back to `demo/`, kept the owner (who still logs in with the same password). Cron runs it every night at 03:30 (Europe/Zurich).

## Also checked through the tunnel

`/healthz` 200; `/fr` and `/en` 200; `robots.txt` disallows everything; `X-Robots-Tag: noindex, nofollow` on pages, `/admin` and `/api`; an order page without its token is a 404 with `Cache-Control: no-store`; a webhook POST without a signature, or with a bad one, gets 400; Mailpit's UI and API aren't reachable (the tunnel routes only the app).

Screenshots are 960 px wide PNGs (palette), the tall pages cut after about two screens. None shows a token, password, cookie or key: the order page's address (with its token) is not in a page screenshot, and the emails' link to the order is a button.
