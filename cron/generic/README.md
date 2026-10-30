# Any other scheduler

Anything that can send an HTTP request with a custom header works.

## crontab

```cron
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $PACKLINK_SYNC_CRON_SECRET" https://shop.example.com/api/jobs/packlink-sync > /dev/null
```

Define `PACKLINK_SYNC_CRON_SECRET` at the top of the crontab or wrap the call
in a script that reads it from a file only the cron user can read.

## Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: packlink-sync
spec:
  schedule: "*/15 * * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: curl
              image: curlimages/curl:8.10.1
              env:
                - name: SECRET
                  valueFrom:
                    secretKeyRef: { name: packlink-sync, key: secret }
              args:
                - -fsS
                - -X
                - POST
                - -H
                - "Authorization: Bearer $(SECRET)"
                - https://shop.example.com/api/jobs/packlink-sync
```

## Hosted schedulers (cron-job.org, EasyCron, Upstash QStash schedules…)

Set the URL of the route, method `POST`, and a request header
`Authorization: Bearer <secret>`.

## Without HTTP

On a server where you can run processes (a VPS, Docker, Dokploy, Coolify…)
you can skip the route and call the engine directly from a script run by your
scheduler:

```ts
// scripts/packlink-sync.ts — run with `npx tsx scripts/packlink-sync.ts`
import { createPacklinkClientFromEnv, syncShipments } from "packlink-nextjs";
import { store, onTransition } from "../lib/shipment-store";

const summary = await syncShipments({ client: createPacklinkClientFromEnv(), store, onTransition });
console.log(JSON.stringify(summary));
process.exit(summary.failed > 0 ? 1 : 0);
```
