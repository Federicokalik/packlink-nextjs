# Example: Next.js App Router + libSQL

The files you would add to an existing Next.js shop. They are type-checked in
CI against the package sources (`npm run typecheck`), but this folder is not a
runnable app on its own.

| File                                                                                         | Role                                                       |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`schema.sql`](./schema.sql)                                                                 | Tables the example reads and writes                        |
| [`.env.example`](./.env.example)                                                             | All environment variables                                  |
| [`lib/packlink.ts`](./lib/packlink.ts)                                                       | Client and shipping rules                                  |
| [`lib/cart.ts`](./lib/cart.ts)                                                               | Request body → trusted cart from the catalog               |
| [`lib/shipment-store.ts`](./lib/shipment-store.ts)                                           | `ShipmentSyncStore` and `onTransition` on the orders table |
| [`lib/create-shipment.ts`](./lib/create-shipment.ts)                                         | Buy / cancel a label without ever paying twice             |
| [`app/api/packlink/shipping-options/route.ts`](./app/api/packlink/shipping-options/route.ts) | Checkout options                                           |
| [`app/api/packlink/dropoffs/route.ts`](./app/api/packlink/dropoffs/route.ts)                 | Pickup points                                              |
| [`app/api/packlink/postal-codes/route.ts`](./app/api/packlink/postal-codes/route.ts)         | Zip validation and autocomplete                            |
| [`app/api/jobs/packlink-sync/route.ts`](./app/api/jobs/packlink-sync/route.ts)               | Route called by the scheduler                              |
| [`app/checkout/dropoff-picker.tsx`](./app/checkout/dropoff-picker.tsx)                       | Pickup-point picker                                        |

Dependencies in your app: `packlink-nextjs`, `@libsql/client` (or your own SQL
client), `server-only`, and `leaflet` for the map.

`createShipmentForOrder` and `cancelShipmentForOrder` are meant to be called
from an admin server action **after** checking that the caller is an admin.
