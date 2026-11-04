# Notes for agents working on light-commerce

This project is built to be changed by agents. Keep it that way.

## What the project is

A lightweight, modular CMS + shop in TypeScript, for small businesses. It is business-agnostic: never build a feature for one specific client.

- Design: `docs/superpowers/specs/2026-11-03-light-commerce-design.md` (read it before your first ticket)
- Stack decision: `docs/adr/0001-stack.md`
- Work is tracked in Linear (team Fluxory, project "Lightweight commerce"). One ticket = one branch = one PR.

## Stack

One Next.js app with **Payload CMS 4** inside it, SQLite by default, and Payload's official ecommerce plugin as the base of the shop. Payment: the plugin's Stripe adapter with Stripe's embedded payment form.

**Payload 4 is in beta and you probably remember Payload 3.** Before writing Payload code, check the v4 docs (`https://payloadcms.com/docs/v4/...`, every page is also served as `.md`) and the 3 → 4 migration guide (`https://payloadcms.com/docs/beta/migration-guide/v4`). Changes that bite:

- Local API `overrideAccess` defaults to `false`. Seed scripts and background jobs must pass `overrideAccess: true` on purpose.
- Default relationship `depth` is 1, not 2.
- Versions are on by default, and `createdBy`/`updatedBy` fields are added.
- Admin components import from `@payloadcms/ui`, not from Next.js.
- Sharp lives in `@payloadcms/transformer-sharp`; `doc.sizes` is now `doc.variants`.

Payload and `@payloadcms/plugin-ecommerce` are pinned to exact versions. Don't upgrade them inside another ticket: each upgrade is its own ticket.

## Commands

Node.js 24 (24.22.1+) and pnpm 12 (`packageManager` in `package.json`). First copy `.env.example` to `.env` and set `PAYLOAD_SECRET` (`openssl rand -hex 32`).

- `pnpm install`: install. A dependency with a build script must be allowed in `pnpm-workspace.yaml` (`allowBuilds`); pnpm 12 ignores the `"pnpm"` field in `package.json`.
- `pnpm dev`: dev server on port 3000 (`pnpm dev -p <port>` for another). It pushes the schema to the SQLite file in `DATABASE_URI` (default `file:./data/light.db`) and regenerates `src/payload-types.ts`.
- `pnpm build`: production build (`payload build`: import map, types, then `next build`) into `.next/standalone`. No Payload queries at build time: the build runs against an empty database.
- `pnpm start`: serves the build (Next warns that standalone output is meant for `node .next/standalone/server.js`, which is what Docker runs).
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: TypeScript, ESLint, vitest. Unit tests are `*.test.ts(x)` in `tests/` or next to the code. A test that needs Payload boots it with `startPayload()` from `tests/support/payload.ts` (fresh temp SQLite file). ESLint fails on imports between `cms` and `shop`, and from core into a module.
- `pnpm generate`: regenerate `src/payload-types.ts` and `src/app/(payload)/admin/importMap.js`. Run it after changing collections, fields or admin components, and commit the result.
- `pnpm generate:check`: fails if those two files are stale. It always compares with both modules on, and never changes your tree.
- `pnpm payload <command>`: the Payload CLI (`pnpm payload --help`).
- `docker compose -f compose.dev.yml up -d mailpit`: Mailpit (SMTP `127.0.0.1:1025`, web UI `127.0.0.1:8025`; override with `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`; this machine's booking-platform Mailpit already holds 1026 and 8026). `--profile app` also runs the production image; see the README, "Docker". `GET /healthz` is the health check.

A broken `light.config.ts` fails `pnpm test`, `pnpm build` and the server's startup (`dev`, `start`, Docker: `src/instrumentation.ts`), with a list of every bad setting and what it expects.

CI (`.github/workflows/ci.yml`) runs on every PR and on `main`:

- `typecheck`, `lint`, `test` and `build` in three setups: both modules, CMS only, shop only. Each module must work with the other one off.
- `generate:check`, with both modules on.

**Tests run in every setup.** Core tests must pass in all three. A module's tests go inside `describeWithCms(...)` or `describeWithShop(...)` from `tests/support/modules.ts`, which skips them when their module is off. A test that needs one fixed setup boots it with `startPayload({ LIGHT_CI_MODULES: 'cms' })` (see `tests/setups/`).

How CI switches modules, and what that means for generated files:

- `LIGHT_CI_MODULES` replaces `modules` in `light.config.ts` without editing it: `cms,shop`, `cms` or `shop`. The result is checked like the file itself (the shop still needs its `shop` section). Run a CI setup locally with, for example, `LIGHT_CI_MODULES=cms pnpm build`. It is for CI and tests only: a site switches modules in `light.config.ts`, and the variable is not in `.env.example`. A production server (`NODE_ENV=production` without `CI` set) refuses to start when it is set, and a dev server logs a warning. To serve a CI setup locally, use `CI=1 LIGHT_CI_MODULES=cms pnpm start`.
- The committed `src/payload-types.ts` describes both modules, because every module's code is type-checked whichever modules are on. With a module off, Payload (`dev`, `build`, `generate`) writes its types to a scratch file in the OS temp dir instead (`src/core/generatedTypes.ts`). So run `pnpm generate` with both modules on (`LIGHT_CI_MODULES=cms,shop pnpm generate` if `light.config.ts` switches one off).
- The import map is still rewritten for the active setup, without the components of a module that is off. Don't commit it from such a setup: restore it with `git checkout -- 'src/app/(payload)/admin/importMap.js'`, or with `pnpm generate` with both modules on.

## Rules

- **Config in code, not in the admin.** Anything that changes rarely (site, locales, modules, shipping, tax display, email wording, theme) lives in `light.config.ts`, validated by a zod schema. Content types live as Payload collection files inside their module. The admin only covers weekly tasks: pages, menus, media, products, stock, orders. Before adding a settings screen, ask whether it should be config instead.
- **Modules stay separate.** `cms` and `shop` are Payload plugins in `src/modules/`. Each must start, typecheck, build and pass tests with the other switched off. They connect through Payload config and hooks (a plugin may extend the config it receives), never by importing each other. A core event bus arrives with outgoing webhooks in a later phase.
- **Payments go through the ecommerce plugin's payment adapter.** No provider SDK calls outside `src/modules/shop/payments/<provider>/`. Card fields are always drawn by the payment provider (embedded form or hosted page); card data never reaches our code. Stripe's webhook is the source of truth for orders, and order creation is idempotent.
- **Money is integer cents** (minor units).
- **One installation per site.** No `organizationId` or tenant fields for now.
- **i18n from the start.** Content is localized FR/EN with Payload localization. Public UI strings go in `messages/{fr,en}.json`.
- **Keep it light.** Think twice before adding a dependency. It must run self-hosted in Docker, with no platform-only APIs.
- **Small files and clear names**, so an agent can find and change one thing without reading everything.
- **Tests guard the config.** A broken `light.config.ts` fails a test and fails startup with a clear message, never a page in production.

## Working next to other agents

Several agents work on this repo at the same time. Stay out of each other's files:

- **One file per collection, global and block.** Only touch the folders your ticket names: `src/core/`, `src/modules/cms/`, `src/modules/shop/`, `src/theme/`. If you need a change in another area, say so in the PR instead of making it.
- **`payload.config.ts` only composes.** Modules register their own collections, globals, hooks and endpoints. Adding a collection should not touch `payload.config.ts`.
- **Public routes belong to modules:** `cms` owns the catch-all page route; `shop` owns `shop/`, `cart/`, `checkout/` and `order/` under `src/app/(frontend)/[locale]/`. Route files stay thin and import from their module.
- **Generated files are regenerated, never hand-merged:** `payload-types.ts` and the admin import map. Rebase, regenerate, commit. CI fails if they are stale.
- **Migrations:** until the first deploy the schema is pushed in development. After the baseline migration exists, a PR that changes the schema regenerates its migration after rebasing on `main`.
- **Branch and PR:** use the issue's git branch name from Linear (for example `jorokolarov/flu-12-product-page`), and start the PR title with the issue ID (`FLU-12: ...`). Rebase on `main` before opening the PR. Shared names and signatures are in `docs/superpowers/plans/2026-11-03-phase-1.md` ("Shared contracts"); don't invent your own for anything listed there.
- **Done means:** the ticket's acceptance criteria are met, and typecheck, lint, tests and build pass locally.

## Related projects

- `jkolarov/booking-platform`: bookings, gift vouchers and the chat assistant for activity schools. A later phase embeds its widgets in light-commerce sites. Its Adyen and SumUp code is a source for future payment adapters, and its `deploy/dev` folder is the model for how the demo is deployed on this machine.
