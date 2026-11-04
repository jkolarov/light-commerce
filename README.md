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

Later phases: outgoing webhooks, an MCP server, an embeddable buy button, redirects import, blog, more shipping and payment options, and embedding the booking platform's widgets.

## Docker

The production image is multi-stage (`Dockerfile`): Node 24 slim, Next.js standalone output, runs as the non-root `node` user, `HEALTHCHECK` on `GET /healthz` (answers `{ "ok": true }` without touching the database). One volume at `/app/data` holds the SQLite file (`DATABASE_URI`, `file:/app/data/light.db` in the container) and the uploads (`MEDIA_DIR`, `/app/data/media`).

```bash
cp .env.example .env            # set PAYLOAD_SECRET (openssl rand -hex 32); Mailpit alone does not need it
docker compose -f compose.dev.yml up -d mailpit                 # email catcher, UI on http://127.0.0.1:8025
docker compose -f compose.dev.yml run --rm schema               # first run only, see below
docker compose -f compose.dev.yml run --rm seed                 # optional: load the demo company (SEED_OWNER_* in .env)
docker compose -f compose.dev.yml --profile app up -d --build   # the app on http://127.0.0.1:3000
```

`NEXT_PUBLIC_*` values are inlined at build time, so they are build args (`NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`); runtime secrets are plain environment variables. Host ports are loopback only and can be changed with `APP_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`.

**How a fresh container gets its schema (until the baseline migration, S26).** The server runs with `NODE_ENV=production`, where Payload never pushes the schema. On start it applies the migrations in `src/migrations/index.ts` (`prodMigrations`), which is empty for now. So a new volume needs a one-off push first: `docker compose -f compose.dev.yml run --rm schema` builds the `schema` image stage (full `node_modules` and the Payload CLI, `NODE_ENV` unset) and runs `payload run scripts/docker/push-schema.ts` against `/app/data/light.db`. Run it again after a deploy that changes the schema, in a terminal: Drizzle asks before any change that would lose data. Once S26 adds the baseline migration, the container migrates on start and `payload migrate` refuses a database made this way, so start that database fresh.

**Demo content.** `pnpm seed` loads the demo company from `demo/` (shape in `demo/README.md`): the owner account from `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD`, the photos, the pages and menus (CMS on), the products with their stock (shop on). Running it again updates the same documents and restores the demo's text and stock; an existing owner keeps their password. It refuses a database with pages, products or photos the demo doesn't have. `SEED_CONFIRM_WIPE=light.db pnpm seed --force` (the database's file name) deletes all content except the user accounts first, after saying what it is about to delete. In Docker, the `seed` service does the same from the `schema` stage, with `demo/` mounted from the checkout (it is not in the image); it pushes the schema first if the database has none (see the service's comment before using it on a migrated database).

## Status

Phase 1 in progress: a complete demo site for a fictional company at `lightcommerce.fluxory.dev`, with a few CMS pages, a few products and a working (test-mode) checkout.

Design: [`docs/superpowers/specs/2026-11-03-light-commerce-design.md`](docs/superpowers/specs/2026-11-03-light-commerce-design.md). Work is tracked in Linear.
