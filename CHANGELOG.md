# Changelog

All notable changes are documented here. The project follows
[Semantic Versioning](https://semver.org); until 1.0 a minor version may
contain breaking changes.

## 0.1.1 — 2026-11-01

- First release published from GitHub Actions through npm trusted publishing,
  with provenance. No code changes.

## 0.1.0 — 2026-11-01

First public version, extracted from a production Next.js storefront.

- Packlink PRO client: services, pickup points, create / read / cancel shipments, labels.
- Postal codes: exact lookup, postal zones and autocomplete search, plus a route handler.
- Response normalization aligned with Packlink's open-source module core:
  `packlink_reference`, `trackings`, `delivery_to_parcelshop` (pickup-point
  delivery, distinct from the sender `dropoff`), nested pickup-point opening times.
- Checkout helper with free-shipping threshold, VAT + markup and flat-rate fallback.
- Cart → single parcel aggregation.
- Route handlers for shipping options, pickup points and the protected sync job.
- `useDropoffPoints` hook and Leaflet `DropoffPointMap`.
- Storage-agnostic status sync with lock, batch limit and at-least-once transitions.
- Scheduler templates: Cloudflare Workers Cron, Vercel Cron, GitHub Actions, generic.
- `AGENTS.md`: guide for AI coding agents, shipped with the package.
