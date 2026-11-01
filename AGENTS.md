# AGENTS.md

Guide for AI coding agents (Claude Code, Codex, Cursor, Copilot and similar).
Part 1 is for agents that add `packlink-nextjs` to a Next.js app. Part 2 is for
agents that work on this repository. [README.md](./README.md) is the full
reference; this file lists what you need to get right first.

## Part 1: integrating the package in an app

### Entry points

| Import                  | Where it runs             | Contents                                             |
| ----------------------- | ------------------------- | ---------------------------------------------------- |
| `packlink-nextjs`       | server only               | client, checkout helpers, parcel maths, status sync  |
| `packlink-nextjs/next`  | server only (route files) | route handler factories, `Request` → `Response`      |
| `packlink-nextjs/react` | client component          | `useDropoffPoints` hook, needs `react` ≥ 18          |
| `packlink-nextjs/map`   | client component          | `<DropoffPointMap>`, needs `react` and `leaflet` 1.9 |

The working reference is [`examples/nextjs-app-router`](./examples/nextjs-app-router).
Copy its structure instead of inventing one: `lib/packlink.ts` creates the
client, one route file per handler, `lib/create-shipment.ts` for shipments,
`lib/shipment-store.ts` for the sync.

### Rules that must not be broken

1. **The API key is a server secret.** Read it from `PACKLINK_API_KEY`, never
   from a `NEXT_PUBLIC_` variable. Create the client in a module that starts with
   `import "server-only"` and never import that module from a client component.
2. **Prices come from the server.** The browser sends cart lines and the
   destination only. When the order is placed, call `resolveShippingOptions`
   again and look the chosen `id` up in the fresh list. Never charge an amount
   that the browser sent.
3. **Creating a shipment is billable, and Packlink accepts duplicates.** Before
   `createShipment`, claim the order with a conditional update
   (`SET packlink_reference = 'pending:<id>' WHERE id = ? AND packlink_reference IS NULL`)
   and stop if no row changed. On a `PacklinkError` with `code: "network"`, keep
   the claim and do not retry: the shipment may exist.
4. **Re-quote before creating.** Call `listServices` right before
   `createShipment`, so the price is today's and the service still exists.
5. **Cancel first, then clear.** Free an order only after `cancelShipment`
   succeeded.
6. **Pickup points.** When an option has `requiresDropoffPoint: true`, block
   payment until a point is selected, and store `selectedId` with the order (the
   label needs it). Do not confuse it with `senderDropoff`: that flag means the
   shop hands the parcel in, and the customer still gets home delivery.
7. **Units.** Weights in grams (`weightGrams`), sizes in millimetres
   (`lengthMm`, `widthMm`, `heightMm`), money in integer cents (`amountCents`,
   `netCents`). Never pass kilograms, centimetres or decimal euros.
8. **Live quotes need complete parcel data.** Use live quotes only when
   `combineParcel(lines).complete` is true. `resolveShippingOptions` already falls
   back to the flat rate; keep that fallback.
9. **Errors.** Use `isPacklinkError(error)` and switch on `error.code`
   (`not_configured`, `invalid_input`, `http`, `network`, `invalid_response`).
   Do not use `instanceof`: the CommonJS build bundles each entry point separately.
10. **Route segment config stays in the route file.** Write
    `export const dynamic = "force-dynamic"` (and `maxDuration` for the sync)
    in each route file. Next.js reads it statically, so it cannot come from the package.
11. **Map styles.** A page that renders `<DropoffPointMap>` must
    `import "leaflet/dist/leaflet.css"`.
12. **Status sync.** Protect the route with `createSyncRoute({ secret, run })` and a
    long random `PACKLINK_SYNC_CRON_SECRET`. Make `onTransition` idempotent
    (`UPDATE orders SET status = 'shipped' WHERE id = ? AND status = 'paid'`):
    it can run more than once. Pick a scheduler template from [`cron/`](./cron).
13. **Do not invent endpoints.** There is no shipment list on purpose. For
    endpoints that the client does not wrap, use `client.request(method, path)`.

### Configuration

Environment variables are listed in
[`examples/nextjs-app-router/.env.example`](./examples/nextjs-app-router/.env.example).
Quotes need `PACKLINK_API_KEY`, `PACKLINK_FROM_ZIP` and `PACKLINK_FROM_COUNTRY`.
Creating shipments also needs the full sender address (`PACKLINK_FROM_NAME`,
`PACKLINK_FROM_STREET`, `PACKLINK_FROM_CITY`, `PACKLINK_FROM_PHONE`,
`PACKLINK_FROM_EMAIL`). Never write a real API key in code, tests or examples.

### Testing an integration

Do not call the real Packlink API from tests: shipments cost money. Pass a mock
`fetch` to `createPacklinkClient({ apiKey, fetch })`, and use
`createMemoryShipmentStore(records)` to test the sync.

## Part 2: working on this repository

### Commands

```bash
npm ci
npm test              # vitest, mocked fetch only
npm run typecheck     # sources, tests and examples
npm run build         # tsup → dist/
npm run format        # prettier; CI runs format:check
```

Run all four before you commit. CI runs the same checks on Node 20, 22 and 24.

### Layout

| Path                       | Contents                                                        |
| -------------------------- | --------------------------------------------------------------- |
| `src/client.ts`            | Packlink PRO API client                                         |
| `src/normalize.ts`         | API response → typed objects; read field names defensively      |
| `src/checkout.ts`          | shipping options, VAT and markup, flat-rate fallback            |
| `src/parcel.ts`            | cart → one parcel                                               |
| `src/status.ts`, `sync.ts` | status classification and the sync engine                       |
| `src/env.ts`               | `PACKLINK_*` variables → client options                         |
| `src/next/`                | route handler factories                                         |
| `src/react/`, `src/map/`   | client components (`"use client"` is added by `tsup.config.ts`) |
| `test/`                    | vitest suites; `test/helpers.ts` has the fetch mock             |
| `examples/`, `cron/`       | example app (type-checked) and scheduler templates              |

### Conventions

- **No runtime dependencies** in the core and `next` entry points: Fetch API and
  Web standards only, no Node.js built-ins.
- **Units in names**: grams, millimetres and integer cents in every public field.
- **Writes fail loudly**: creating or cancelling a shipment throws; never turn a
  failed write into an empty result.
- **New response shapes**: handle them in `src/normalize.ts` and add a test with
  the payload you saw, with personal data and keys removed.
- **Docs in two languages**: a change to `README.md` needs the same change in
  `README.it.md`. Add user-facing changes to `CHANGELOG.md`.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`).
- **Releases**: see "Releasing" in [CONTRIBUTING.md](./CONTRIBUTING.md). Do not
  run `npm publish` yourself.
