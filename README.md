# light-commerce

A lightweight, modular CMS + shop in TypeScript, made for vibe-coders.

Most small businesses (a beekeeper selling honey, a paragliding school, a small winery) need a good-looking site, a few pages they can edit and a small shop. They usually end up with WordPress + a page builder + WooCommerce + a pile of plugins. light-commerce is the small version of that.

## The idea

**Config lives in code, and an agent changes it.** Site settings, shipping, tax display, payment setup, email wording and the theme live in one typed file, `light.config.ts`. Content types are Payload collections in code. You ask Claude Code (or any agent) to change them, so nobody has to build or click through a settings screen.

**The admin panel is only for weekly tasks:** edit pages, add products, update stock, process orders.

## Stack

One Next.js app with [Payload CMS 4](https://payloadcms.com) inside it, SQLite by default, Payload's ecommerce plugin for the shop, and Stripe's embedded payment form. Self-hosted with Docker. Why: [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md).

## Modules

- `core`: config, users, media, email, i18n
- `cms`: pages with blocks, menus, SEO, sitemap
- `shop`: products, stock, cart, checkout, orders, shipping, order emails

Use the CMS alone, the shop alone, or both.

Content is in French and English. Publishing a page or a product publishes it in every language at once; text not translated yet shows in the default language (French). "Unpublish in English" in the admin takes one language offline until the next publish.

Later phases: outgoing webhooks, an MCP server, an embeddable buy button, redirects import, blog, more shipping and payment options, and embedding the booking platform's widgets.

## Docker

The production image is multi-stage (`Dockerfile`): Node 24 slim, Next.js standalone output, runs as the non-root `node` user, `HEALTHCHECK` on `GET /healthz` (answers `{ "ok": true }` without touching the database). One volume at `/app/data` holds the SQLite file (`DATABASE_URI`, `file:/app/data/light.db` in the container) and the uploads (`MEDIA_DIR`, `/app/data/media`).

```bash
cp .env.example .env            # set PAYLOAD_SECRET (openssl rand -hex 32); Mailpit alone does not need it
docker compose -f compose.dev.yml up -d mailpit                 # email catcher, UI on http://127.0.0.1:8025
docker compose -f compose.dev.yml --profile app up -d --build   # the app on http://127.0.0.1:3000 (migrates the database first)
docker compose -f compose.dev.yml run --rm seed                 # optional: load the demo company (SEED_OWNER_* in .env)
```

`NEXT_PUBLIC_*` values are inlined at build time, so they are build args (`NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`); runtime secrets are plain environment variables. Host ports are loopback only and can be changed with `APP_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`.

**How a container's database gets its schema: migrations.** The server runs with `NODE_ENV=production`, where Payload never pushes the schema. It applies the pending migrations in `src/migrations/` (`prodMigrations`, starting with the baseline) as it starts, before it answers anything (`src/instrumentation.ts`, `src/core/dbStartup.ts`), and exits if one fails, so a broken migration is a restart loop rather than a healthy server answering 500s. A new volume gets its tables on the first start. One-off jobs on that database (the seed, the demo's nightly reset, `payload migrate`) run in the image's `schema` stage: the full `node_modules` and the Payload CLI, `NODE_ENV=production` too, so they also migrate and never push. `docker compose -f compose.dev.yml run --rm schema` applies the migrations without starting the app. A schema change comes with a new migration (`pnpm payload migrate:create <name>`, see the plan's "Database schema"); a test fails when one is missing. Pushing is for development databases only (`pnpm dev`, the tests, `scripts/docker/push-schema.ts`): a database that was pushed once can't be migrated, so never push into a volume a container serves, and start such a database fresh.

**Demo content.** `pnpm seed` loads the demo company from `demo/` (shape in `demo/README.md`): the owner account from `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD`, the photos, the pages and menus (CMS on), the products with their stock (shop on). Running it again updates the same documents and restores the demo's text and stock; an existing owner keeps their password. It refuses a database with pages, products or photos the demo doesn't have. `SEED_CONFIRM_WIPE=light.db pnpm seed --force` (the database's file name) deletes all content except the user accounts first, after saying what it is about to delete. In Docker, the `seed` service does the same from the `schema` stage, with `demo/` mounted from the checkout (it is not in the image).

## Status

Phase 1 is done and live: a complete demo site for a fictional company, Les Claies (herbal teas), at [lightcommerce.fluxory.dev](https://lightcommerce.fluxory.dev). Six CMS pages and six products in French and English, a cart, Stripe's embedded payment form in test mode (card `4242 4242 4242 4242`), orders from Stripe's webhook, a confirmation page and order emails (caught by a Mailpit on the host, nothing is sent). The owner edits pages, products, stock and orders in `/admin`. The demo is hidden from search engines and reset every night. The finish-line walkthrough, with screenshots: [`docs/phase-1-walkthrough/`](docs/phase-1-walkthrough/README.md). How it is hosted: [`deploy/demo/README.md`](deploy/demo/README.md).

Next: the later phases above, from the backlog in Linear.

Design: [`docs/superpowers/specs/2026-11-03-light-commerce-design.md`](docs/superpowers/specs/2026-11-03-light-commerce-design.md). Work is tracked in Linear.
