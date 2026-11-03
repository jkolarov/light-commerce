# light-commerce: design

Status: approved by the owner · 2026-11-03 · source: GitHub issue #1 and the conversation that refined it.

This document is what tickets get planned from. Decisions marked **(owner)** were made by the project owner. Decisions marked **(my call)** were made while writing this and can be overridden. Everything not decided here is left to the builder (see the last section).

## 1. Intent

Small businesses need a good-looking site, a few pages they can edit and a small shop. Today they get WordPress + a page builder + WooCommerce + plugins, or a SaaS that does ten times too much. light-commerce is the small version: a TypeScript app that a developer, or a vibe-coder with an agent, clones, configures and deploys.

The core idea stays the one from issue #1: **the agent is the config panel.** Anything that changes rarely (content types, shipping, tax, payment setup, email templates, theme) lives in code, and an agent changes it. The admin panel only covers weekly tasks: pages, products, stock, orders, media.

The product is **business-agnostic** (owner). No feature is built for one specific client. The two pilots from issue #1 (a beekeeper, the Kymaya paragliding school) only survive as generic needs: weight-based shipping, local pickup, FR/EN, redirect import, embedding an outside widget. The project is **open-ended** (owner): phase 1 has a clear finish line, later phases are a backlog that grows.

## 2. Phase 1 finish line (owner)

A fully working website for a **fictional company**, running at a **demo URL**:

- a few pages edited through the CMS (home, about, contact, legal/terms, shipping info), in FR and EN
- a few example products with photos, prices and stock
- a working checkout in Stripe test mode: browse → cart → pay with the embedded Stripe form → order recorded → confirmation page → order emails sent
- the owner can log in to the admin, edit a page, add a product, change stock and see the order

## 3. Stack (owner, details in `docs/adr/0001-stack.md`)

- **Next.js + Payload CMS 4**, one app. Payload provides the typed config, database layer, admin, auth, media, localization, block editor (Lexical) and REST/GraphQL API.
- **Payload's official ecommerce plugin** (`@payloadcms/plugin-ecommerce`) is the base of the shop: products, variants, stock, carts, transactions, orders, customers, addresses.
- **Payment: the plugin's built-in Stripe adapter**, which shows Stripe's embedded payment form on our checkout page (owner). Card fields are always drawn by the payment provider; card data never reaches our code.
- **SQLite** by default (`@payloadcms/db-sqlite`). Postgres support is a later phase.
- **Payload 4, starting on its beta (owner), pinned to an exact version; ecommerce plugin pinned the same way.** Payload 4 is in public beta since 2026-10-09 with no stable date yet. Starting on it avoids a v3 → v4 migration later; phase 1 is a demo with fictional data, so beta risk is acceptable. Each move to a newer beta, and finally to stable, is its own ticket, as is every ecommerce plugin upgrade. Payload 4 needs Node.js 24, Next.js 16.4+ and TypeScript 6. If the spike shows the v4 beta can't meet the criteria, fall back to Payload 3.92.x (pre-approved, see section 8).
- Self-hosted with Docker on a small VPS. No platform-only APIs.

The ADR is written now with status **Proposed**. A short spike (first ticket) checks its assumptions against numbers and flips it to **Accepted**, or reports what failed.

## 4. Shape of the product

### 4.1 One installation per site (my call)

One running app serves one site. There is no `organizationId` and no tenant field in phase 1. Nothing in the design may block adding Payload's official multi-tenant plugin later, but nothing is built for it now.

### 4.2 One ready-to-run repo (my call)

The repo is the product: clone it, edit `light.config.ts`, add secrets to `.env`, deploy with Docker. `cms` and `shop` are separate Payload plugins inside the repo. Each can be switched off in `light.config.ts`, and each must work without the other. They are written so they could later be published as npm packages, but phase 1 does not publish anything.

### 4.3 `light.config.ts` is the file agents edit (my call)

- `light.config.ts` at the repo root holds the owner-facing settings: site name and URL, locales and default locale, which modules are on, theme (colours, fonts, logo), shop currency, shipping rates, tax display, email sender and templates' wording, admin email for order notifications.
- It is validated by a zod schema. A broken config fails a unit test and fails startup with a clear message, never a page in production ("tests guard the config").
- `payload.config.ts` is plumbing. It reads the validated `light.config.ts` and composes core + enabled modules. Agents rarely need to touch it.
- Content types themselves (collections, fields, blocks) are Payload collection files inside the modules. Adding a field is a code change an agent makes there.

### 4.4 Layout that lets several agents work at once (my call)

Multiple agents will work in parallel, so the layout must keep them out of each other's files.

```
light.config.ts                    # owner-facing settings (zod-validated)
src/
  payload.config.ts                # composes only: imports core + enabled modules
  config/                          # zod schema + loader for light.config.ts
  core/                            # owned by core tickets
    collections/Users.ts
    collections/Media.ts
    email/  i18n/  access/
  modules/
    cms/                           # owned by cms tickets
      index.ts                     # export const cmsPlugin = (opts) => Plugin
      collections/Pages.ts
      globals/Header.ts  globals/Footer.ts
      blocks/<Block>/config.ts + Component.tsx
    shop/                          # owned by shop tickets
      index.ts                     # export const shopPlugin = (opts) => Plugin (wraps the ecommerce plugin)
      shipping/  emails/  components/
  app/
    (payload)/                     # Payload admin + API routes (generated, rarely touched)
    (frontend)/[locale]/           # public site; route files are thin and import from modules
  theme/                           # shared UI for the public site (layout, header, footer, typography)
messages/{fr,en}.json              # UI strings of the public site
tests/
```

Rules:

- **One file per collection, global and block.** No ticket adds content to another module's folder.
- **Modules register themselves.** Each plugin adds its own collections, globals, hooks, endpoints and admin settings. `payload.config.ts` only lists plugins, so a new collection does not touch it.
- **Cross-module features go through Payload config, not imports.** Example: the shop may add a "product grid" block to the CMS's pages, but only if the pages collection exists, by extending the config it receives. `cms` code never imports from `shop` and the other way round.
- **Public routes are owned by module:** `cms` owns the catch-all page route; `shop` owns `shop/`, `cart/`, `checkout/` and `order/`. A shop route returns 404 when the shop is off.
- **Generated files are regenerated, never hand-merged:** `payload-types.ts` and the admin import map. CI fails if they are out of date.
- **Database migrations:** during phase 1 development the schema is pushed automatically; a baseline migration is created before the first deploy. From then on each PR that changes the schema regenerates its migration after rebasing on `main`.

### 4.5 i18n (issue #1, details my call)

FR and EN from the start. Content uses Payload's field-level localization. The admin UI is available in FR and EN. Public-site UI strings (buttons, cart, checkout, emails) come from `messages/{fr,en}.json` via next-intl, as in booking-platform. URLs are prefixed by locale (`/fr/...`, `/en/...`); the default locale comes from `light.config.ts`.

### 4.6 Money

Prices are integer minor units (cents). The spike checks how the ecommerce plugin stores prices; if it uses decimals, the ADR records how we keep the rule.

### 4.7 Admin only for weekly tasks (issue #1)

The admin shows: pages, header/footer menus, media, products, orders, users. Collections that exist only for the machinery (carts, transactions, addresses, variant types) are hidden or read-only. Before anyone adds a settings screen, the question is whether it belongs in `light.config.ts` instead.

### 4.8 Payment providers

Payment goes only through the ecommerce plugin's payment adapter interface. No provider SDK is called outside `src/modules/shop/payments/<provider>/`. Stripe is the only provider in phase 1. Adyen and SumUp adapters come later, ported from `jkolarov/booking-platform`.

Requirements the Stripe flow must meet, whatever the built-in adapter does by default (my call):

- **The amount charged includes shipping.** Cart subtotal + flat shipping rate from `light.config.ts`.
- **Stripe's webhook is the source of truth for orders.** An order exists once Stripe confirms the payment, even if the buyer closes the tab right after paying. Order creation is idempotent: the browser confirm path and the webhook can both run without creating two orders or decreasing stock twice.
- Use the built-in Stripe adapter where it meets these. Where it doesn't, wrap or extend it in `src/modules/shop/payments/stripe/`, still behind the plugin's adapter interface. The spike finds out which.

### 4.9 What "each module works without the other" means in phase 1 (my call)

- The app starts, typechecks, builds and passes unit tests in three setups: both modules on, CMS only, shop only. CI runs all three.
- The end-to-end test runs only with both on.
- With the shop off, shop routes return 404 and shop blocks don't appear. With the CMS off, the home page falls back to the product list, and the theme renders without CMS menus (a minimal header and footer from `light.config.ts`). No further shop-only pages are built in phase 1.

## 5. Phase 1 scope

### In

**Foundation**
- Scaffold: Next.js 16.4+ + Payload 4 (beta, pinned) + SQLite, strict TypeScript, pnpm, lint, vitest
- `light.config.ts` + zod schema + tests
- Users with two roles: owner (everything) and staff (content, products, orders)
- Media: local disk uploads with resized image variants
- Email: one transport configured from env (SMTP); a local catcher in development
- FR/EN localization (content, admin, public UI)
- Dockerfile + compose (app + volumes for the database file and uploads), production build in CI, not on the VPS
- CI on GitHub Actions: typecheck, lint, unit tests, build, generated-files check
- Seed script that creates the fictional company's pages, menus, products and an owner account

**CMS**
- Pages with a slug per locale, drafts and a block layout. A starting set of blocks: hero, rich text, image + text, call to action, and the shop's product grid when the shop is on.
- SEO fields per page (official SEO plugin)
- Header and footer menus (globals)
- `sitemap.xml` and `robots.txt` from Next.js
- Home page from the CMS

**Shop**
- Products with price, stock, photos and FR/EN text; variants only if the plugin gives them with no extra work
- Product list and product page
- Cart for guests (stored in the database by the plugin)
- Checkout: customer details + shipping address, flat-rate shipping from `light.config.ts`, embedded Stripe form (test mode)
- Order created when Stripe confirms the payment (webhook), stock decreased
- Order confirmation page
- Order emails: confirmation to the customer, notification to the owner
- Prices shown tax-inclusive, with the tax rate for display from `light.config.ts`; no tax calculation

**Theme**
- A default theme for the public site whose colours, fonts and logo come from `light.config.ts`. It must look like a real small-business site, not a template demo.

**Demo**
- A fictional company (name, logo, 4–6 products with photos, the pages listed in section 2), in FR and EN
- Deployed at the demo URL, hidden from search engines
- Hosting (owner): in Docker on the owner's machine that already runs booking-platform's dev stack (x86, 15 GB RAM). Deployed the same way as `deploy/dev` there (my call): its own compose project, its own Cloudflare tunnel, loopback-only host ports, a `deploy.sh`. Address `lightcommerce.fluxory.dev` (owner). Agents on that machine run the deploy, including creating the tunnel's DNS record.
- Stripe (owner): reuse booking-platform's **test-mode** keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `~/code/booking-platform/deploy/dev/.env`; booking-platform no longer uses Stripe). light-commerce registers its own webhook endpoint for the demo address, with its own signing secret. Locally, the Stripe CLI forwards webhooks. Keys live only in `.env` files that are never committed.
- Safe for anonymous visitors (my call): **no email leaves the demo**. Every email goes to a Mailpit instance that isn't public, as in booking-platform's dev stack. A nightly reset restores stock and deletes demo orders. No public admin login.

### Out (later phases, open-ended backlog)

- **Integrations:** core event bus + outgoing webhooks (`order.paid`, `product.updated`, ...), MCP server (official MCP plugin), documented JSON API with write tokens, embeddable buy button / cart widget (one `<script>` line)
- **Shop depth:** shipping by weight and local pickup, tax rules, discount codes, refunds from the admin, customer accounts, Adyen and SumUp adapters
- **CMS depth:** blog posts, redirects (official redirects plugin + CSV import for site migrations), search, embed block for outside widgets
- **Platform:** Postgres, S3-compatible media storage, Payload 4 stable upgrade, multi-tenant, backups
- **Booking-platform integration:** blocks for the booking widget (`data-booking-widget`), gift vouchers (`data-gift`), chat bubble (`data-booking-chat`) and links to `?activity=<slug>`, built on the generic embed block

## 6. Changes to existing repo files

These go in together with this document, before any ticket starts, because every agent reads them first:

- **AGENTS.md:** stack decided (Payload on Next.js, link to the ADR); payment rule becomes "card fields are always drawn by the payment provider, card data never reaches our code; no provider SDK outside `src/modules/shop/payments/<provider>/`"; `organizationId` rule removed (one installation per site); "modules talk through the core's events" becomes "modules connect through Payload config and hooks, never by importing each other; a core event bus arrives with outgoing webhooks in a later phase"; add the file-ownership, generated-files and migration rules from section 4.4; tell agents the project is on Payload 4, to read the v4 docs (`payloadcms.com/docs/v4/...`, also served as `.md`) and the 3 → 4 migration guide, because they will mostly remember Payload 3 (for example: Local API `overrideAccess` now defaults to `false`, versions are on by default, admin components import from `@payloadcms/ui`).
- **README.md:** status and stack.
- **docs/adr/0001-stack.md:** written now as Proposed.

## 7. Outside this design

Issue #1 also lists two questions only the owner can settle: the license and product/service model, and checking the side-project rules of the owner's employment contract (this project touches payments). Neither blocks phase 1 development; the contract check should happen before anything takes real payments.

## 8. The spike, and what may start before it (my call)

The spike is the first ticket. If a criterion fails, the builder may settle these without the owner and record them in the ADR:

- another Payload 4 beta or Next.js 16.x version, if the pinned pair doesn't work together
- falling back to Payload 3.92.x if the v4 beta can't meet the criteria
- memory thresholds raised by up to 50%
- keeping integer cents in our code on top of a plugin that stores decimals
- plugin collections that can only be made read-only rather than hidden
- wrapping or extending the Stripe adapter (section 4.8)

Anything bigger goes back to the owner: Payload or the ecommerce plugin unusable, or SQLite unworkable.

Until the ADR is Accepted, only work that doesn't depend on Payload may start: the fictional company's content (texts, product data, images) and its visual direction. The plan's "blocked by" relations are the authority on what starts when.

## 9. Left to the builder

- Ticket breakdown, order and dependencies
- The fictional company's name, story, products and visual direction (within: believable small producer, FR/EN)
- The exact block set beyond the starting four, component library choices, Tailwind setup
- Test strategy beyond: config tests, unit tests for shipping and order logic, and one automated end-to-end test of browse → cart → checkout (Stripe may be stubbed in CI)
- Image sizes, email template design, error pages
- Exact Node.js 24 minor version
