# ADR 0001: Stack

Status: **Accepted** (2026-11-03, after the spike below: all six criteria pass on Payload 4.0.0-beta.6; the Stripe adapter is wrapped as section 8 of the design allows).

## Context

light-commerce is a lightweight, modular CMS + shop for small businesses (GitHub issue #1). It must:

- keep rarely changed settings in typed code that an agent edits, and keep the admin to weekly tasks
- have separate `cms` and `shop` modules that each work alone
- take payments through an adapter, with card data never reaching our code
- support FR and EN from the start
- run self-hosted on a small VPS or in Docker

The sister project `jkolarov/booking-platform` runs Next.js 16 + Prisma + next-intl + Stripe/Adyen/SumUp.

## Options considered

1. **Next.js + our own code**, reusing booking-platform (Prisma, next-auth, next-intl, payment code). Full control and familiar, but we would have to build what issue #1 calls the core idea ourselves: content types defined in config, generated admin forms, localization, drafts, media, a block editor. That is the largest piece of work in the issue.
2. **Next.js + Payload CMS 3.** Payload is built around a typed config that defines collections and fields, from which it generates the admin, the API and the database schema. It provides auth, media, field-level localization, drafts and versions, a Lexical block editor, SQLite and Postgres adapters, and official SEO, redirects, multi-tenant and MCP plugins. Its official ecommerce plugin adds products, variants, stock, carts and orders, with a payment-adapter interface and a Stripe adapter.
3. **Astro + Keystatic (git-based content) + Stripe.** Lightest for a content site, but the shop still needs a server, a database and an admin for orders and stock. No reuse from booking-platform.
4. **Medusa.** A commerce engine, too heavy for this scope and without the CMS half.

## Decision

Option 2: **one Next.js app with Payload 4 inside it**, using:

- Payload **4**, starting on its public beta (since 2026-10-09), pinned to an exact version. Starting on v4 avoids a v3 → v4 migration later, and phase 1 is a demo with fictional data. We move to newer betas and to stable deliberately, one ticket each. Fallback: Payload 3.92.x if the v4 beta fails the spike. Runtime: Node.js 24, Next.js 16.4+, TypeScript 6.
- `@payloadcms/db-sqlite` by default. Postgres later.
- `@payloadcms/plugin-ecommerce` (pinned to an exact version, since it is marked beta) as the base of the `shop` module.
- The ecommerce plugin's **built-in Stripe adapter with Stripe's embedded payment form**. This replaces the earlier "hosted checkout only" rule with: card fields are always drawn by the payment provider, and card data never reaches our code.
- `cms` and `shop` as our own Payload plugins inside the repo.
- One installation per site. No `organizationId` or tenant field for now.

## Consequences

- Most of the core and CMS checklist in issue #1 comes from Payload. Our work concentrates on the shop additions (shipping, tax, order emails, buy button), the theme and the integrations.
- We depend on Payload's release cycle, now owned by Figma (MIT license kept).
- We start on a beta, with the ecommerce plugin also in beta on top of it. Expect breaking changes between betas. Agents mostly know Payload 3, so AGENTS.md points them to the v4 docs and the 3 → 4 migration guide.
- The ecommerce plugin is beta: upgrades are deliberate, one ticket each.
- Payload's admin is full-featured. We keep it to weekly tasks by hiding or locking collections.
- Next.js + Payload is heavier than options 3 or 1. Production builds run in CI, not on the VPS.

## Spike: what turns this into Accepted

A throwaway branch with the latest Payload 4 beta, Next.js 16.4+, SQLite and the ecommerce plugin, plus a pages collection and a products collection. Pass criteria (thresholds are a first proposal; edit them if they don't fit the target server):

1. The four packages install and run together without patches.
2. Production build succeeds on a GitHub Actions standard runner.
3. Docker image runs with idle memory (RSS) under 400 MB, and stays under 768 MB while using the admin and completing a checkout.
4. A guest can add a product to a cart and pay with Stripe's embedded form in test mode (card 4242 4242 4242 4242), and an order is created with stock decreased. The charged amount includes a flat shipping fee. The order is created from Stripe's webhook even when the browser never returns, and only once when both paths run. Record whether the built-in adapter does this or needs wrapping.
5. The admin can be reduced to pages, media, products, orders and users, with the plugin's other collections hidden or read-only.
6. We know how the plugin stores prices (integer minor units or decimals), and how we keep the integer-cents rule.

The spike's results are added below, and the status changes to Accepted. Small failures may be settled by the builder (see section 8 of `docs/superpowers/specs/2026-11-03-light-commerce-design.md`). Bigger ones (Payload or the ecommerce plugin unusable, SQLite unworkable) go back to the owner for a new decision.

## Spike results

Run on 2026-11-03 (FLU-10). Code: branch [`spike/payload-v4`](https://github.com/jkolarov/light-commerce/tree/spike/payload-v4), never merged. It is Payload's own ecommerce template (`create-payload-app@4.0.0-beta.6 -t ecommerce --db sqlite`), switched to EUR, with one page, one product (12.50 €, stock 20) and our wrapper in `src/modules/shop/payments/stripe/`. Checkouts were driven by Playwright (headless Chromium): the card number 4242 4242 4242 4242 was typed into Stripe's own Payment Element iframe. Race tests confirmed payments server-side with Stripe's test method `pm_card_visa`.

### Result per criterion

| # | Criterion | Result | Numbers and evidence |
|---|---|---|---|
| 1 | Packages install and run together without patches | **Pass** | `payload`, `@payloadcms/next`, `@payloadcms/db-sqlite`, `@payloadcms/plugin-ecommerce` 4.0.0-beta.6 with Next.js 16.4.2, React 19.3.1, TypeScript 6.0.3, Node.js 24.22.2. No package is patched. pnpm 12 needs `allowBuilds` in `pnpm-workspace.yaml` (see the S02 notes). The ecommerce template's own frontend needed three small type fixes for SQLite's number IDs; that is template code, not a package. |
| 2 | Production build on a GitHub Actions standard runner | **Pass** | [Run 41735750733](https://github.com/jkolarov/light-commerce/actions/runs/41735750733), `ubuntu-latest` (4 vCPU, 15.7 GB), no caches: install 5 s, build 30 s, whole job 52 s. With sharp variants and `output: 'standalone'` ([run 41738813439](https://github.com/jkolarov/light-commerce/actions/runs/41738813439)): build 42 s, job 62 s. Locally (6 vCPU i5-9400F), cold: 28.7 s, peak about 4 GiB RSS summed over the build processes. The build needs a database that has the schema, because `generateStaticParams` queries Payload (see "Findings"). |
| 3 | Docker: idle RSS < 400 MB, < 768 MB while using the admin and doing a checkout | **Pass** | All numbers in MiB (the unit of `docker stats`; the thresholds pass read as MB or MiB). Image `node:24.22.2-slim` + Next standalone, 310 MB. Idle 60 s after start: 102–114 (`docker stats`), RSS 151–159. Idle after the first admin and shop requests: 141–143, RSS 192–200. Admin use (log in, 15 admin views, upload a 12 MP 8 MB photo with 3 sharp variants, change stock) plus 3 checkouts and a 12-way confirm race: RSS high-water mark 448 after one upload, 497 after two uploads and the checkouts (cgroup peak 471). Without image variants: 291. Stress, not part of the criterion: 13 uploads of the same photo in a row level off at RSS 610–640 with a high-water mark of 719. Memory is driven by image uploads, not by checkout (see "Findings"). |
| 4 | Guest cart → embedded Stripe form → order, stock down, shipping charged, webhook alone creates the order, once only | **Pass with wrapping** | Out of the box the browser path works (order created, stock 20 → 19) but the charged amount has no shipping and the webhook does nothing. With the wrapper (below): charged 17.40 € = 12.50 € + 4.90 € shipping (PaymentIntent amount 1740, order amount 1740); "browser never returns" creates the order from the webhook alone; resending the event, a late browser confirm, browser + webhook together, and 6- and 12-way concurrent confirms each give exactly one order and one stock decrement. In the Docker image the browser path, the webhook-only path, a resend and a 12-way race gave the same results. |
| 5 | Admin reduced to pages, media, products, orders, users | **Pass** | `admin.hidden: true` on `carts`, `addresses`, `variants`, `variantTypes`, `variantOptions` (the last three exist only while variants are on): gone from the navigation, their admin URLs return 404, the REST API still works (guest carts keep working). `transactions`: `access.create/update/delete: () => false` plus `admin.group: false`: not in the navigation, list and documents still open read-only (no Save, no Create). The users edit page still works with hidden joins. |
| 6 | How prices are stored | **Pass** | Minor units (cents), integer by convention only. Each currency adds `priceIn<CODE>` and `priceIn<CODE>Enabled` (checkbox) to products and variants: `priceInEUR`, SQLite column `price_in_e_u_r`, declared `numeric` in the migration (the stored 1250 has SQLite type `integer`). The plugin's price and amount fields are plain `number` fields with no integer check; only the admin's price input converts euros to cents (it shows 1250 as € 12.50). So the Local API, REST or a seed could store 12.5. Cart `subtotal`, transaction `amount` and order `amount` follow the same convention; the plugin's `EUR` currency has `decimals: 2`. How we keep the rule: S13 adds an integer validator (`Number.isInteger`, ≥ 0) to `priceInEUR` through the overrides (plan, Shared contracts). |

Section 8 settlements made: the Stripe adapter is wrapped (pre-approved), and transactions are read-only rather than hidden (pre-approved). No fallback to Payload 3.92.x, and the memory thresholds are unchanged.

### What the built-in Stripe adapter does

- **Shipping in the charged amount: no.** `initiatePayment` charges `cart.subtotal`, and the plugin has no shipping. It can be added by wrapping `initiatePayment` and adding the shipping amount to `cart.subtotal` before calling the original. Confirmation stays valid: `validateSettlement` compares the PaymentIntent amount with the transaction amount, and both carry the shipping. The order has no separate shipping field (only `amount`, the total). The shop adds `subtotal` and `shippingAmount` (plan contract): stored on the transaction at payment start, then passed into the plugin's `finalizeOrder` by wrapping the adapter's `confirmOrder`. Verified on the browser, webhook-only and 12-way race paths (1250 + 490 = 1740 on each order).
- **Order created from the webhook: no.** The plugin's webhook endpoint (`POST /api/payments/stripe/webhooks`) checks the signature and calls the handlers you pass in `stripeAdapter({ webhooks })`; it creates nothing itself. It also answers 200 and does nothing when `webhookSecret` or `secretKey` is missing, or when the request has no `stripe-signature` header; only a bad signature gets 400 (`payments/adapters/stripe/endpoints/webhooks.js`). A misconfigured site therefore loses webhook orders silently. In the spike, a payment whose browser confirm was dropped stayed `succeeded` at Stripe while the transaction stayed `pending`, with no order and no stock change.
- **Idempotent order creation: yes, through `confirm-order`.** `POST /api/payments/stripe/confirm-order` first claims the transaction atomically (`pending` → `processing` with an `UPDATE ... WHERE status = 'pending'`). Only the winning call creates the order, marks the cart purchased, decrements stock and sets the transaction to `succeeded`. Every other call polls for up to 500 ms: it returns the same order if the winner finished by then, and otherwise answers 500 ("Transaction settlement did not complete in time"). In the spike the winner always finished in time, so every racing call got 200. If anything throws after the claim (an orders create hook, a cart or transaction update hook), the transaction stays `processing` for good and every later confirm, webhook retries included, answers 500.
- **The wrapper that closes the gap** (spike: `src/modules/shop/payments/stripe/index.ts`, about 90 lines). A `payment_intent.succeeded` handler looks up the transaction by PaymentIntent ID and returns if it has already succeeded. Otherwise it reads the guest cart's `secret` with `payload.db.findOne` (the field is locked for normal reads), finds the plugin's own `confirm-order` endpoint in `payload.config.endpoints`, and calls its handler with a request built by `createPayloadRequest`. So the webhook and the browser go through the same atomic claim. If confirmation fails, the handler throws, the webhook answers 500, and Stripe retries. The plugin's `finalizeOrder` is not exported, so calling the endpoint handler is the supported way to reuse it. The spike covers guest checkout only. For a logged-in customer, the request also needs `user` set to that customer.

### Versions to pin

| Package | Version |
|---|---|
| `payload` | 4.0.0-beta.6 |
| `@payloadcms/next`, `@payloadcms/ui`, `@payloadcms/db-sqlite`, `@payloadcms/plugin-ecommerce`, `@payloadcms/richtext-lexical`, `@payloadcms/translations`, `@payloadcms/transformer-sharp`, `@payloadcms/plugin-seo`, `@payloadcms/email-nodemailer` | 4.0.0-beta.6 (all `@payloadcms/*` share Payload's version) |
| `next` | 16.4.2 (Payload's peer range is `>=16.4.0 <17`; 16.4.2 is what the v4 templates pin and what was tested) |
| `react`, `react-dom` | 19.3.1 |
| `typescript` | 6.0.3 (npm `latest` is now 7.0.2; Payload asks for 6.0.3+ and was tested on 6.0.3) |
| `@types/react`, `@types/react-dom`, `@types/node` | 19.3.0, 19.3.0, 24.12.3 |
| `stripe` (server SDK, used by the adapter) | 18.5.0 |
| `@stripe/stripe-js`, `@stripe/react-stripe-js` | 4.10.0, 3.11.0 |
| `sharp` | 0.35.5 (dependency of `@payloadcms/transformer-sharp`) |
| `@libsql/client` | 0.14.0 (dependency of `@payloadcms/db-sqlite`) |
| Node.js | 24.22.2 (Payload needs 24.22.1+); Docker `node:24.22.2-slim` |
| pnpm | 12.16.1 |
| `@playwright/test`, `vitest` | 1.63.0, 5.0.1 (template versions) |

### Findings later tickets need

- **The build needs a database with the schema** when pages call Payload at build time (`generateStaticParams`). With an empty database the build fails: `no such table: pages`. Production never pushes the schema. The spike ran `payload migrate` on a throwaway database before `payload build`, but the project has no migrations until S26, so until then **no Payload queries at build time**: routes that read Payload render dynamically (plan, Shared contracts). The same applies to containers: S08/S24 run with `NODE_ENV=production`, where Payload never pushes the schema, so their database stays empty until a schema push or S26's baseline migration (see the plan's "Database schema" contract).
- **SQLite runs without database transactions by default.** `@payloadcms/db-sqlite` only opens transactions when `transactionOptions` is set. The plugin's atomic claim is what keeps orders unique, and it held in every race. Turning transactions on made things worse under concurrent confirms: with `busyTimeout` 0, 11 of 12 calls failed with `SQLITE_BUSY`, and the one that answered 200 with an order ID was never committed. With `busyTimeout: 5000` and WAL, `SQLITE_BUSY_SNAPSHOT` still caused 500s. Keep the default (no `transactionOptions`). S02 writes exactly `sqliteAdapter({ client: { url: process.env.DATABASE_URI }, busyTimeout: 5000, wal: true })`: that combination (no transactions, `busyTimeout` 5000, WAL file) passed three 12-way races with webhooks. WAL lets the CLI, a seed or the nightly reset write while the server runs; backups must then copy the `-wal` and `-shm` files too, or use SQLite's backup command. Without transactions, a crash between the claim and the order leaves a transaction in `processing`; abandoned payments leave `pending` ones. S18/S26 need a small reconciliation for both.
- **The cart subtotal can be stale at payment time.** It is recomputed from stored prices on every cart write, so a client cannot send its own (a cart posted with `subtotal: 1` stored 2500). `initiatePayment` charges the stored subtotal without recomputing it: after a price change, an older cart was charged the old price. S17 recomputes before charging.
- **Stock check for variants never runs at payment start.** In `endpoints/initiatePayment.js` the variant check sits inside `if (item.product && !item.variant)`. Product stock is checked. This only matters if variants are used.
- **No unique index on `transactions.stripe.paymentIntentID` out of the box.** The adapter expects exactly one transaction per PaymentIntent and fails closed otherwise. `stripeAdapter({ groupOverrides })` can add `unique: true` to that field (tested: SQLite creates a unique index and rejects a duplicate; checkout and races still pass). The guarantee of one order per payment stays the atomic claim; the index stops a second transaction for the same PaymentIntent.
- **Stock can go below 0.** The plugin decrements stock with `payload.db.updateOne({ inventory: { $inc: -quantity } })`, which skips the field's `min: 0` and all hooks, and `confirm-order` does not re-check stock (only `initiate` does). Two carts paying for the last unit both succeed, and stock ends at -1 (read from the code; not run in the spike). A `min: 0` or a products hook cannot catch it. The wrapper has to check before and, afterwards, clamp to 0 and flag the order (plan, Orders).
- **Versions are on for the plugin's collections too** (`_carts_v`, `_transactions_v`, `_orders_v` fill up on every cart change). S13 should set `versions: false` on carts and transactions through the overrides.
- **Image uploads drive memory.** Each 12 MP upload with 3 variants added roughly 50–100 MiB until RSS levelled off at 610–640 MiB (high-water 719 MiB, close to the 768 MB line). With jemalloc preloaded (sharp's advice for glibc), steady RSS after many uploads was lower (503–546 MiB, high-water 669 MiB), but idle rose to 262 MiB and the first upload peaked higher (587 MiB). Not a clear win. S05 should resize the stored original (for example to 2560 px) or cap upload size; S08 can set a container memory limit with that margin in mind.
- **Order access token:** the template adds `orders.accessToken` with `crypto.randomUUID()` (122 random bits), and `confirm-order` returns `accessToken` in its response whenever the field exists. The contract asks for at least 128 bits, so S18 generates it with `crypto.randomBytes`.
- Abandoned payments: `initiatePayment` creates a `pending` transaction and a Stripe customer per email; nothing cleans them up.
- The adapter pins different Stripe API versions in `initiatePayment` (`2025-06-30.preview`) and `confirmOrder`/webhooks (`2025-03-31.basil`). Harmless in the spike.

### Notes for the scaffold (S02)

- **Create the app** in an empty directory, then move it into the repo root (keep the repo's `AGENTS.md`, `CLAUDE.md`, `docs/`):
  `npx create-payload-app@4.0.0-beta.6 -n light-commerce -t blank --db sqlite --db-connection-string file:./data/light.db --use-pnpm --no-git --no-agent --no-deps --branch v4.0.0-beta.6 --payload-version 4.0.0-beta.6`
  `--branch v4.0.0-beta.6` matters: templates are downloaded from GitHub, and the default `main` moves ahead of the pinned beta. The `ecommerce` template exists for v4, but it is a full store with Mongo-shaped frontend code; start from `blank` and add `@payloadcms/plugin-ecommerce`.
- **What `blank` brings and what to change:** `@payloadcms/plugin-mcp` and the `Folders`/`Tags` collections (remove them); `@payloadcms/transformer-sharp` with `upload.transformers: [sharpTransformer()]` (keep it; image sizes are now `variants` on the transformer); localization `en` only with `fallback: true` (S02 sets `fr`/`en`); `withPayload(nextConfig, { devBundleServerPackages: false })`; a Dockerfile (alpine, standalone) and a `docker-compose.yml`. Create-payload-app writes `DATABASE_URL` and `PAYLOAD_SECRET` to `.env`; the plan's name is `DATABASE_URI`, so rename it in `payload.config.ts` and `.env.example` (the plugin does not care).
- **Files under `src/app/(payload)/`:** `layout.tsx`, `custom.css`, `admin/importMap.js`, `admin/[[...segments]]/page.tsx`, `admin/[[...segments]]/not-found.tsx`, `api/[...slug]/route.ts`, `api/graphql/route.ts`, `api/graphql-playground/route.ts`. They say "generated automatically" but are copied once; only `admin/importMap.js` is rewritten by a command. The public site goes in a sibling route group, `src/app/(frontend)/`.
- **Generated files:** `payload generate:types` writes `src/payload-types.ts` (path from `typescript.outputFile`); `payload generate:importmap` writes `src/app/(payload)/admin/importMap.js`. Those two are what `generate:check` compares. `payload generate:db-schema` writes `src/payload-generated-schema.ts` (with a hyphen, whatever the docs say), needed only if code uses Drizzle directly; leave it out. `payload migrate:create <name>` writes `src/migrations/<timestamp>_<name>.ts`, a `.json` snapshot and `src/migrations/index.ts`.
- **Build environment:** `payload build` passed with only `PAYLOAD_SECRET` and the database URL (`DATABASE_URL` in the spike, `DATABASE_URI` in the project) set (no `.env`, no Stripe keys, no `NEXT_PUBLIC_*`), against a database file that had the schema, because the template's pages query Payload at build time. With no build-time queries (the rule until S26), an empty database file should be enough; that case was not run. CI and Docker set those two. They also set `NEXT_PUBLIC_SERVER_URL` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, because `NEXT_PUBLIC_*` values are baked into the client bundle: placeholders in CI, real values for an image that will run. If a startup check that needs Stripe keys runs when Payload initialises (S17), the build initialises Payload too and needs placeholder Stripe keys. The templates' `--max-old-space-size=8000` is not needed. Without it (Node's default heap limit here is about 4 GiB), the build passed with at most 2.3 GiB in one process and 3.2 GiB across the process tree. Drop the flag or set a smaller one.
- **Scripts:** `payload build` runs `generate:importmap`, then `generate:types`, then `next build` (Turbopack). Use it as `build`. The v4 CLI changed (`payload --help`): `config.bin` is gone; per the migration guide, custom commands such as the seed are registered under `cli.commands` with `defineCLICommand`. `payload run <script.ts>` runs a one-off script (used for the spike seed).
- **pnpm 12:** the `"pnpm"` field in `package.json` is ignored (the template's `onlyBuiltDependencies` does nothing), and unapproved build scripts fail the install (`ERR_PNPM_IGNORED_BUILDS`). `pnpm approve-builds esbuild` writes `allowBuilds: { esbuild: true }` to `pnpm-workspace.yaml`; that is all the blank template + SQLite needs (checked by installing it). Deny unwanted ones with `false` (the ecommerce template also pulls `@vercel/git-hooks`). sharp 0.35, `@libsql/client` and `unrs-resolver` ship prebuilt binaries and need no build step. The blank template's `engines.pnpm` (`^9 || ^10 || ^11`) does not include pnpm 12 (pnpm 12.16.1 installed anyway, without a warning): widen it or drop it. Add `"packageManager": "pnpm@12.16.1"`.
- **Next.js 16.4 writes into `AGENTS.md`.** `next dev` appends a "This is NOT the Next.js you know" block unless `next.config.ts` sets `agentRules: false`. Set it, or every agent's tree has an unwanted change.
- **Docker (guidance for S08 and S05; where it differs from S08's acceptance criteria, S08's criteria win):** `output: 'standalone'`. Base `node:24.22.2-slim` (glibc) worked with the prebuilt `@libsql/linux-x64-gnu` and `@img/sharp-linux-x64`; the lockfile also lists the musl builds, but alpine was not tested here (Payload's own Dockerfile uses `node:24.22.1-alpine` with `libc6-compat`). The standalone image has no Payload CLI, so run migrations at startup with `prodMigrations: migrations` on the SQLite adapter (tested: the baseline ran on first start in 2.8 s). Until S26 there are no migrations, so `prodMigrations` has nothing to run and the schema comes from a one-off push (plan, "Database schema"). Set upload directories from an absolute path in env so files land on the volume, rather than the template's path computed relative to the source file. The spike used `MEDIA_DIR=/data/media`; with S08's volume at `/app/data` that becomes `/app/data/media`, and the database `file:/app/data/light.db`. `NEXT_PUBLIC_*` values are inlined at build time, so pass them as build args. The container runs as the `node` user.
- **Development vs production schema:** `next dev` pushes the schema automatically; production never does. Don't mix push and `migrate` on one database file.
