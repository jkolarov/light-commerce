# ADR 0001: Stack

Status: **Proposed** (2026-11-03). Becomes Accepted when the spike below passes.

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

_Not run yet._
