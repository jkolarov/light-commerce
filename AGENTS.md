# Notes for agents working on light-commerce

This project is built to be changed by agents. Keep it that way.

## What the project is

A lightweight, modular CMS + shop in TypeScript. Scope, pilots and open questions: issue #1.
The stack has not been chosen yet. The decision goes in `docs/adr/0001-stack.md`. Don't scaffold an app before that ADR exists.

## Rules

- **Config in code, not in the admin.** Anything that changes rarely (content types, fields, shipping, taxes, payment provider, email templates, theme) lives in the typed config file (`light.config.ts`). The admin panel only covers weekly tasks: pages, products, stock, orders, media. Before adding a settings screen, ask whether it should be config instead.
- **Modules stay separate.** `cms` and `shop` must each work without the other. They talk through the core's events, never by importing each other's internals.
- **Payments go through an adapter.** No provider SDK calls outside `payments/<provider>`. Use hosted checkout only: card data never touches this code.
- **Money is integer cents.** Every business table carries an `organizationId`.
- **i18n from the start.** All user-facing text is translatable (FR and EN at minimum).
- **Keep it light.** Think twice before adding a dependency. It must run self-hosted (Docker or a small VPS), with no platform-only APIs.
- **Small files and clear names**, so an agent can find and change one thing without reading everything.
- **Tests guard the config.** A broken config should fail a test, not a page in production.

## Related projects

- `jkolarov/booking-platform`: bookings, gift vouchers and the chat assistant for activity schools (Kymaya). The site embeds it rather than rebuilding it. Its Stripe, Adyen and SumUp code is a good source for payment adapters.
