# light-commerce

A lightweight, modular CMS + shop in TypeScript, made for vibe-coders.

Most small businesses (a beekeeper selling honey, a paragliding school, a small winery) need a good-looking site, a few pages they can edit and a small shop. They usually end up with WordPress + a page builder + WooCommerce + a pile of plugins. light-commerce is the small version of that.

## The idea

**Config lives in code, and an agent changes it.** Content types, shipping rules, taxes, payment setup, email templates and the theme are all defined in one typed config file. You ask Claude Code (or any agent) to change them, so nobody has to build or click through a settings screen.

**The admin panel is only for weekly tasks:** edit pages, add products, update stock, process orders.

## Planned modules

- `core`: config, database, auth, media, events and webhooks
- `cms`: pages, posts, menus, redirects, SEO, sitemap
- `shop`: products, cart, hosted checkout (Stripe first), orders, shipping
- `integrations`: JSON API, embeddable cart/buy button, MCP server

Use the CMS alone, the shop alone, or both.

## Status

Planning. See issue #1 for the scope, the pilots and the open questions.
