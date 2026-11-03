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

## Status

Phase 1 in progress: a complete demo site for a fictional company at `lightcommerce.fluxory.dev`, with a few CMS pages, a few products and a working (test-mode) checkout.

Design: [`docs/superpowers/specs/2026-11-03-light-commerce-design.md`](docs/superpowers/specs/2026-11-03-light-commerce-design.md). Work is tracked in Linear.
