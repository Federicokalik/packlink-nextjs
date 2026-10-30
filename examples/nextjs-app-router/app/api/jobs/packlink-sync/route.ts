import { syncShipments } from "packlink-nextjs";
import { createSyncRoute } from "packlink-nextjs/next";

import { packlink } from "@/lib/packlink";
import { onTransition, shipmentStore } from "@/lib/shipment-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by the scheduler, never by the browser (see cron/ in the repository).
// On Vercel Cron use `process.env.CRON_SECRET`: that is the header Vercel sends.
export const { GET, POST } = createSyncRoute({
  secret: process.env.PACKLINK_SYNC_CRON_SECRET,
  run: () => syncShipments({ client: packlink, store: shipmentStore, onTransition }),
});
