/**
 * The Worker is only the timer: it calls the protected sync route of your
 * app, holds no order data and never talks to Packlink itself.
 */
export interface Env {
  /** Full URL of the sync route, e.g. https://shop.example.com/api/jobs/packlink-sync */
  PACKLINK_SYNC_URL: string;
  /** Same value as PACKLINK_SYNC_CRON_SECRET in the app. */
  PACKLINK_SYNC_CRON_SECRET: string;
}

export default {
  fetch(): Response {
    // Runs come exclusively from the Cron Trigger: there is nothing to serve.
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
} satisfies ExportedHandler<Env>;

async function run(env: Env): Promise<void> {
  const response = await fetch(env.PACKLINK_SYNC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PACKLINK_SYNC_CRON_SECRET}` },
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(
      JSON.stringify({
        message: "packlink_sync_failed",
        status: response.status,
        body: body.slice(0, 500),
      }),
    );
    // Throwing marks the invocation as failed in the Cron Events dashboard.
    throw new Error(`Packlink sync HTTP ${response.status}`);
  }
  console.log(JSON.stringify({ message: "packlink_sync_completed", summary: body.slice(0, 500) }));
}
