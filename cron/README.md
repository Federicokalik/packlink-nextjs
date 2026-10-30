# Scheduling the status sync

The sync runs inside your app (`syncShipments` behind `createSyncRoute`). A
scheduler only has to call that route on a fixed interval with the shared
secret:

```http
POST /api/jobs/packlink-sync
Authorization: Bearer <PACKLINK_SYNC_CRON_SECRET>
```

`GET` works too, for schedulers that cannot send anything else (Vercel Cron).
The route answers `503` while the secret is not configured on the app side,
`401` for a wrong secret and `200` with a JSON summary otherwise:

```json
{
  "skipped": false,
  "processed": 4,
  "refreshed": 4,
  "changed": 1,
  "shipped": 1,
  "delivered": 0,
  "terminal": 0,
  "failed": 0,
  "errors": []
}
```

`skipped: true` means another run still holds the lock — normal when two
invocations overlap.

| Scheduler                                           | Template                                    | Notes                                                       |
| --------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Cloudflare Workers Cron Triggers                    | [`cloudflare-worker/`](./cloudflare-worker) | Free plan included; precise to the minute.                  |
| Vercel Cron Jobs                                    | [`vercel/`](./vercel)                       | Uses GET and `CRON_SECRET`. Hobby plan: once a day at most. |
| GitHub Actions                                      | [`github-actions/`](./github-actions)       | Free; runs can start several minutes late.                  |
| crontab, systemd, Kubernetes CronJob, cron-job.org… | [`generic/`](./generic)                     | Anything that can send an HTTP request with a header.       |

Every 15 minutes is a reasonable interval: carriers update a few times a day
and each run only processes a small batch (`limit`, default 20).

## Generating the secret

Use a long random string and set the **same value** in the app and in the
scheduler:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
