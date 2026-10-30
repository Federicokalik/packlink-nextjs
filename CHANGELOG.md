# Changelog

All notable changes are documented here. The project follows
[Semantic Versioning](https://semver.org); until 1.0 a minor version may
contain breaking changes.

## 0.1.0 — unreleased

First public version, extracted from a production Next.js storefront.

- Packlink PRO client: services, pickup points, create / read / cancel shipments.
- Checkout helper with free-shipping threshold, VAT + markup and flat-rate fallback.
- Cart → single parcel aggregation.
- Route handlers for shipping options, pickup points and the protected sync job.
- `useDropoffPoints` hook and Leaflet `DropoffPointMap`.
- Storage-agnostic status sync with lock, batch limit and at-least-once transitions.
- Scheduler templates: Cloudflare Workers Cron, Vercel Cron, GitHub Actions, generic.
