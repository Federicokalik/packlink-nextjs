# Cloudflare Workers Cron Trigger

A Worker with no public URL that calls your sync route every 15 minutes.
Your app can be hosted anywhere (Vercel, Cloudflare, a VPS…).

1. Copy this folder out of the repository (or keep it in your app's repo) and install:

   ```bash
   npm install
   ```

2. Set `PACKLINK_SYNC_URL` in `wrangler.jsonc` to your production route.

3. Store the secret — the same value as `PACKLINK_SYNC_CRON_SECRET` in the app:

   ```bash
   npx wrangler secret put PACKLINK_SYNC_CRON_SECRET
   ```

4. Deploy:

   ```bash
   npm run deploy
   ```

Change the schedule in `triggers.crons`. Runs and failures show up under
**Workers & Pages → packlink-sync-cron → Settings → Trigger Events** and in
the Worker logs.

To try it locally, run `npm run dev` and open
`http://localhost:8787/__scheduled` (or `/cdn-cgi/handler/scheduled`, depending
on the Wrangler version).
