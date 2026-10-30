# packlink-nextjs

Unofficial [Packlink PRO](https://pro.packlink.com) integration for **Next.js**:
live shipping quotes at checkout, pickup-point selection, shipment labels, and a
scheduled sync that moves your orders forward as parcels travel.

Packlink has no official SDK for JavaScript or Next.js. This package was
extracted from a production e-commerce (Next.js 16, App Router) and made
independent of its database, catalog and hosting.

[Leggi in italiano](./README.it.md)

> Not affiliated with, endorsed or sponsored by Packlink. "Packlink" is a
> trademark of its owner and is used here only to describe what the package
> connects to.

- **Typed client** for the Packlink PRO API: services, pickup points, create / read / cancel shipments. Zero runtime dependencies.
- **Checkout that never breaks**: free shipping above a threshold → live quotes (net + VAT + your markup) → flat-rate fallback when Packlink is slow or down.
- **Cart → one parcel**: weight and box size from your product data, with a packing model that errs on the safe side.
- **Pickup points**: a route handler, a React hook, and an optional Leaflet map.
- **Status sync on any scheduler**: a storage-agnostic engine and a secured route, with ready templates for Cloudflare Workers Cron, Vercel Cron, GitHub Actions and plain crontab.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Creating shipments](#creating-shipments)
- [Status sync](#status-sync)
- [Units and conventions](#units-and-conventions)
- [Errors](#errors)
- [API](#api)
- [Runtime notes](#runtime-notes)
- [Security](#security)
- [Development](#development)

## Install

```bash
npm install packlink-nextjs
```

| Import                  | What                                                | Peer dependencies      |
| ----------------------- | --------------------------------------------------- | ---------------------- |
| `packlink-nextjs`       | Client, checkout helpers, parcel maths, status sync | —                      |
| `packlink-nextjs/next`  | Route handler factories (`Request` → `Response`)    | —                      |
| `packlink-nextjs/react` | `useDropoffPoints` hook (client component)          | `react` ≥ 18           |
| `packlink-nextjs/map`   | `<DropoffPointMap>` (client component)              | `react`, `leaflet` 1.9 |

Node.js 20 or later. The server parts use only the Fetch API and Web
standards — no Node.js built-ins — so other Fetch-based runtimes should work
too, though CI only tests Node.js.

## Quick start

A complete, type-checked example lives in
[`examples/nextjs-app-router`](./examples/nextjs-app-router).

### 1. Configure

```bash
# .env.local — server only, never NEXT_PUBLIC_
PACKLINK_API_KEY=your-packlink-pro-api-key
PACKLINK_FROM_ZIP=03100
PACKLINK_FROM_COUNTRY=IT
# The full sender address is needed only to create shipments:
PACKLINK_FROM_NAME=Your Shop
PACKLINK_FROM_STREET=Via Roma 1
PACKLINK_FROM_CITY=Frosinone
PACKLINK_FROM_PHONE=+39...
PACKLINK_FROM_EMAIL=orders@example.com
```

All variables are listed in [`.env.example`](./examples/nextjs-app-router/.env.example).

```ts
// lib/packlink.ts
import "server-only";
import { createPacklinkClientFromEnv, type ShippingRules } from "packlink-nextjs";

export const packlink = createPacklinkClientFromEnv();

export const shippingRules: ShippingRules = {
  flatRateCents: 990, // when live quotes are off or unavailable
  freeThresholdCents: 7900, // free home delivery from €79
  vatPct: 22, // Packlink prices are net
  markupPct: 10, // your margin
};
```

Prefer explicit options? Use `createPacklinkClient({ apiKey, sender, ... })`.

### 2. Shipping options route

The browser sends the cart lines and the destination; prices, weights and sizes
are always read from **your** catalog on the server.

```ts
// app/api/packlink/shipping-options/route.ts
import { createShippingOptionsRoute } from "packlink-nextjs/next";
import { packlink, shippingRules } from "@/lib/packlink";
import { loadCart } from "@/lib/cart"; // body → { subtotalCents, lines } from your DB

export const dynamic = "force-dynamic";

export const { POST } = createShippingOptionsRoute({
  client: packlink,
  resolveCart: loadCart,
  rules: shippingRules,
  extraOptions: [{ id: "pickup", label: "In-store pickup", amountCents: 0, kind: "custom" }],
});
```

`POST { items, zip, country }` answers `{ options, subtotalCents }`:

```json
{
  "options": [
    {
      "id": "packlink-20945",
      "label": "InPost — Locker",
      "amountCents": 537,
      "kind": "packlink",
      "packlinkServiceId": 20945,
      "requiresDropoff": true
    },
    {
      "id": "packlink-21021",
      "label": "BRT — Express",
      "amountCents": 1103,
      "kind": "packlink",
      "packlinkServiceId": 21021,
      "requiresDropoff": false
    },
    { "id": "pickup", "label": "In-store pickup", "amountCents": 0, "kind": "custom" }
  ],
  "subtotalCents": 4590
}
```

Not using route handlers? Call `resolveShippingOptions(packlink, { destination, parcel, subtotalCents, rules })` directly.

> **Charge what you quote.** When the order is placed, run
> `resolveShippingOptions` again on the server and look the chosen `id` up in
> the fresh list. Never trust an amount sent back by the browser.

### 3. Pickup points

```ts
// app/api/packlink/dropoffs/route.ts
import { createDropoffsRoute } from "packlink-nextjs/next";
import { packlink } from "@/lib/packlink";

export const dynamic = "force-dynamic";
export const { GET } = createDropoffsRoute({ client: packlink });
```

```tsx
"use client";
import "leaflet/dist/leaflet.css";
import { useDropoffPoints } from "packlink-nextjs/react";
import { DropoffPointMap } from "packlink-nextjs/map";

const { points, loading, error, selectedId, select } = useDropoffPoints({
  serviceId: option?.packlinkServiceId,
  zip,
  country,
  enabled: Boolean(option?.requiresDropoff),
});

<DropoffPointMap points={points} selectedId={selectedId} onSelect={select} />;
```

Block the payment step while an option with `requiresDropoff` has no point
selected, and store `selectedId` with the order: the label needs it. The map is
optional — the hook works with any UI. See
[`dropoff-picker.tsx`](./examples/nextjs-app-router/app/checkout/dropoff-picker.tsx).

## Creating shipments

```ts
const shipment = await packlink.createShipment({
  serviceId, // re-quoted now, see below
  to: { name, surname, street1, city, zip, country, phone, email },
  parcels: [combineParcel(orderLines)],
  content: "1 sewing machine",
  contentValueCents: order.subtotalCents,
  customReference: order.number, // find it in the Packlink panel
  dropoffPointId: order.dropoffPointId,
});
// → { reference, status, trackingNumber, trackingUrl, labelUrl }
```

Creating a shipment is billable, and **Packlink accepts an identical duplicate**:
two clicks are two labels. Before calling `createShipment`, claim the order in
your database with a conditional update (`... SET packlink_reference = 'pending:<id>'
WHERE id = ? AND packlink_reference IS NULL`) and stop if no row changed. After a
timeout (`code: "network"`) you cannot know whether the shipment exists: keep
the claim and check the Packlink panel instead of retrying.

Also worth doing, as the example does:

- **re-quote** with `listServices` right before creating: the price you pay is
  today's, and the service the customer chose must still exist on that route;
- **cancel first, then clear**: call `cancelShipment` and free the order only if
  it succeeded, or you may end up with a live, paid label nobody knows about.

The full pattern is in
[`create-shipment.ts`](./examples/nextjs-app-router/lib/create-shipment.ts).

## Status sync

Packlink only tells you where a parcel is when you ask. `syncShipments` asks
for a small batch of open shipments, saves what changed, and calls
`onTransition` when a parcel moves from `pending` to `shipped`, `delivered` or
`terminal` — the place to update the order and email the customer.

```ts
// app/api/jobs/packlink-sync/route.ts
import { syncShipments } from "packlink-nextjs";
import { createSyncRoute } from "packlink-nextjs/next";
import { packlink } from "@/lib/packlink";
import { shipmentStore, onTransition } from "@/lib/shipment-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute({
  secret: process.env.PACKLINK_SYNC_CRON_SECRET,
  run: () => syncShipments({ client: packlink, store: shipmentStore, onTransition }),
});
```

The store is a small interface over your own tables
([SQL example](./examples/nextjs-app-router/lib/shipment-store.ts)):

```ts
interface ShipmentSyncStore {
  listOpen(limit: number): Promise<{ id; reference; status }[]>; // not final, least recently synced first
  save(record, update): Promise<void>; // status, tracking, label, final flag
  acquireLock?(ttlMs: number): Promise<boolean>; // optional: no overlapping runs
  releaseLock?(): Promise<void>;
}
```

What the engine guarantees:

- **one batch per run** (`limit`, default 20, max 100), least recently synced
  first, so a big backlog is worked through over several runs;
- **one failure does not stop the run**: it is counted and reported in `errors`;
- **transitions are at-least-once**: `onTransition` runs before `save`; if it
  throws, nothing is saved and the next run retries. Make it idempotent
  (`UPDATE orders SET status = 'shipped' WHERE id = ? AND status = 'paid'`);
- **unknown statuses never move an order**: Packlink states are free text, and
  only unambiguous ones are classified (`classifyShipmentStatus`, or pass your
  own `classifyStatus`). The raw text is saved anyway.

### Triggering it

Anything that can call the route with `Authorization: Bearer <secret>`:

| Scheduler                                                | Template                                             |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Cloudflare Workers Cron Triggers                         | [`cron/cloudflare-worker`](./cron/cloudflare-worker) |
| Vercel Cron Jobs (GET + `CRON_SECRET`)                   | [`cron/vercel`](./cron/vercel)                       |
| GitHub Actions                                           | [`cron/github-actions`](./cron/github-actions)       |
| crontab, Kubernetes CronJob, cron-job.org, direct script | [`cron/generic`](./cron/generic)                     |

Every 15 minutes is plenty. Details and caveats (Vercel Hobby runs crons once a
day; GitHub schedules can be late) are in [`cron/README.md`](./cron/README.md).

## Units and conventions

| Quantity | Unit in this package                      | Sent to Packlink as     |
| -------- | ----------------------------------------- | ----------------------- |
| Weight   | grams (`weightGrams`)                     | kg, 2 decimals, min 0.1 |
| Size     | millimetres (`lengthMm`…)                 | whole cm, min 1         |
| Money    | integer cents (`netCents`, `amountCents`) | decimal units           |

- A parcel without dimensions is quoted as a **20 × 20 × 20 cm** box
  (`fallbackDimensionsMm` to change it). That is why the checkout only uses live
  quotes when `combineParcel(...).complete` is true: a product without data would
  make the parcel look smaller than it is, and the courier bills the difference.
- `combineParcel` packs a cart in one box: the base is the largest item, the
  height is the total volume over that base (never less than the tallest item).
- `netCents` is Packlink's `base_price`, VAT excluded.
- Home delivery keeps the id `"flat"` whether free or paid, so a customer's
  choice survives the re-quote at order time.

## Errors

Every client method throws a `PacklinkError` with a `code`:

| `code`             | Meaning                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `not_configured`   | No API key, or sender data missing for this call                        |
| `invalid_input`    | Rejected before calling Packlink (bad zip, country, address…)           |
| `http`             | Packlink answered non-2xx — see `status` and `body`                     |
| `network`          | Timeout or connection failure — the request may or may not have arrived |
| `invalid_response` | 2xx with an unusable body                                               |

Use `isPacklinkError(error)` rather than `instanceof`: the CommonJS build
bundles each entry point separately.

Degrading is decided in one place each: `resolveShippingOptions` falls back to
the flat rate, the pickup-point route answers 502, the sync counts a failure.

## API

### `packlink-nextjs`

| Export                                                                                   |                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `createPacklinkClient(options)`                                                          | `apiKey`, `sender`, `baseUrl`, `currency` (EUR), `timeouts` (`read` 6 s, `write` 20 s), `fallbackDimensionsMm`, `fetch`, `fetchInit` |
| `createPacklinkClientFromEnv(env?, overrides?)`                                          | Same, from `PACKLINK_*` variables                                                                                                    |
| `client.listServices({ to, from?, parcels, disabledCarriers?, includeDropoff? })`        | Services, cheapest first                                                                                                             |
| `client.listDropoffs({ serviceId, country, zip })`                                       | Pickup points                                                                                                                        |
| `client.createShipment(input)` / `getShipment(ref)` / `cancelShipment(ref)`              | Shipments                                                                                                                            |
| `client.request(method, path, { body?, timeoutMs? })`                                    | Any other endpoint                                                                                                                   |
| `resolveShippingOptions(client, input)`                                                  | Checkout options with fallback                                                                                                       |
| `priceWithVatAndMarkup(netCents, { vatPct, markupPct })`                                 | Net → gross                                                                                                                          |
| `combineParcel(lines)`, `combineDimensions`, `hasCompleteParcelData`, `totalWeightGrams` | Cart → parcel                                                                                                                        |
| `syncShipments({ client, store, limit?, lockTtlMs?, classifyStatus?, onTransition? })`   | Status sync                                                                                                                          |
| `createMemoryShipmentStore(records)`                                                     | In-memory store for tests and scripts                                                                                                |
| `classifyShipmentStatus(status)`, `isFinalProgress(progress)`                            | Status → `pending` / `shipped` / `delivered` / `terminal`                                                                            |
| `normalizeCarrierName`, `cleanSecret`, `PacklinkError`, `isPacklinkError`                | Utilities                                                                                                                            |

### `packlink-nextjs/next`

| Export                                                                                | Route                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------- |
| `createShippingOptionsRoute({ client, resolveCart, rules, extraOptions?, onError? })` | `POST` → `{ options, subtotalCents }`       |
| `createDropoffsRoute({ client, onError? })`                                           | `GET ?serviceId&zip&country` → `{ points }` |
| `createSyncRoute({ secret, run })`                                                    | `GET` and `POST`, bearer-protected          |
| `isAuthorizedCronRequest(request, secret)`                                            | Constant-time bearer check                  |

`rules` and `extraOptions` can also be functions of the resolved cart, e.g. to
read the configuration from your database or to price per shipping class.

### `packlink-nextjs/react` and `packlink-nextjs/map`

`useDropoffPoints({ serviceId, zip, country, endpoint?, enabled? })` →
`{ points, loading, error, selectedId, selected, select }`.

`<DropoffPointMap points selectedId? onSelect? className? style? tileUrl? attribution? icon? />`
— renders nothing when no point has coordinates. Leaflet is imported in an
effect, so the component is safe to server-render; remember
`import "leaflet/dist/leaflet.css"`.

## Runtime notes

- Requests default to `cache: "no-store"` so Next.js never caches a quote. On a
  runtime that rejects the `cache` option, pass `fetchInit: {}`.
- Route segment config (`dynamic`, `runtime`, `maxDuration`) must stay in your
  route files: Next.js reads it statically.
- `PACKLINK_API_BASE_URL` / `baseUrl` points the client elsewhere, e.g. at a
  sandbox host if Packlink gave you one.

## Security

- The API key is a server secret: import the client only from server code
  (`import "server-only"` in the module that creates it helps).
- Re-price on the server at order time; quotes shown in the browser are previews.
- The sync route is closed (503) until a secret is configured, and compares the
  bearer token in constant time. Use a long random value.
- Pickup-point names and addresses come from a third party: the map builds its
  popups with DOM text nodes, never HTML strings. Do the same in your UI.

## Development

```bash
npm install
npm test           # vitest
npm run typecheck  # sources, tests and examples
npm run build      # tsup → dist/
```

See [CONTRIBUTING.md](./CONTRIBUTING.md). Changes are listed in
[CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE)
