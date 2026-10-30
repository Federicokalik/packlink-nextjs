# Vercel Cron Jobs

Vercel calls the route with **GET** and, when the project has a `CRON_SECRET`
environment variable, adds `Authorization: Bearer <CRON_SECRET>`. Pass that
variable to `createSyncRoute`:

```ts
// app/api/jobs/packlink-sync/route.ts
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute({
  secret: process.env.CRON_SECRET,
  run: () => syncShipments({ client: packlink, store, onTransition }),
});
```

Then declare the schedule in `vercel.json` (see [`vercel.json`](./vercel.json))
or in `vercel.ts`:

```ts
// vercel.ts
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [{ path: "/api/jobs/packlink-sync", schedule: "*/15 * * * *" }],
};
```

Cron jobs only run on production deployments. On the **Hobby** plan they can
run at most once a day, which is too rare to follow parcels: on Hobby use the
Cloudflare or GitHub Actions template and keep the Vercel route as the target.
