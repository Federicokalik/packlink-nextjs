// Scheduled shipment status sync.
//
// Packlink has no webhook this package relies on: a scheduler (Cloudflare
// Cron Trigger, Vercel Cron, GitHub Actions, crontab…) calls a protected
// route every few minutes, and the route calls `syncShipments`. The engine
// knows nothing about your database — it goes through a `ShipmentSyncStore`
// you implement over your orders table.
//
// It is safe to call on a fixed interval: writes are idempotent, the
// optional lock makes retries and overlapping invocations harmless, and each
// run handles a small batch, least recently synced first.

import type { PacklinkClient } from "./client";
import { classifyShipmentStatus, isFinalProgress, type ShipmentProgress } from "./status";
import type { PacklinkShipment } from "./types";

/** A shipment you are tracking, e.g. an order that has a Packlink reference. */
export interface TrackedShipment {
  /** Your own id (order id, fulfillment id…). */
  id: string | number;
  /** Packlink shipment reference. */
  reference: string;
  /** Last Packlink status you saved; used to detect transitions. */
  status: string | null;
  /** Label already saved: when set, the label is not asked for again. */
  labelUrl?: string | null;
}

export interface ShipmentUpdate {
  shipment: PacklinkShipment;
  previousProgress: ShipmentProgress;
  progress: ShipmentProgress;
  /** The raw Packlink status text changed. */
  statusChanged: boolean;
  /** The progress changed (e.g. pending → shipped): `onTransition` was called. */
  progressChanged: boolean;
  /** Delivered or terminal: stop returning this record from `listOpen`. */
  final: boolean;
  syncedAt: Date;
}

export interface ShipmentSyncStore<T extends TrackedShipment = TrackedShipment> {
  /**
   * Up to `limit` shipments still worth polling — not final, and belonging to
   * orders you still care about — least recently synced first.
   */
  listOpen(limit: number): Promise<T[]>;
  /**
   * Persist the fresh state: status, tracking, label, sync time, and a final
   * marker when `update.final` is true. Do not overwrite a tracking number
   * typed by hand with an empty one: a just-created label has none yet.
   */
  save(record: T, update: ShipmentUpdate): Promise<void>;
  /** Optional lease so that two runs never overlap. Return `false` when held. */
  acquireLock?(ttlMs: number): Promise<boolean>;
  releaseLock?(): Promise<void>;
}

export interface SyncShipmentsOptions<T extends TrackedShipment = TrackedShipment> {
  client: Pick<PacklinkClient, "getShipment">;
  store: ShipmentSyncStore<T>;
  /** Shipments per run. Default 20, at most 100. */
  limit?: number;
  /** Lock lease. Default 5 minutes: longer than any run, short enough to recover from a crash. */
  lockTtlMs?: number;
  classifyStatus?: (status: string | null) => ShipmentProgress;
  /**
   * Fetch the label for shipments that do not have one saved yet (one extra
   * request each, until it exists). Default `true`; return `labelUrl` from
   * `listOpen` so that it stops once the label is stored.
   */
  includeLabels?: boolean;
  /**
   * Called when the progress changes, before the new state is saved: if it
   * throws, nothing is saved and the next run retries the transition. It can
   * therefore run more than once for the same transition — make it idempotent
   * (e.g. `UPDATE orders SET status = 'shipped' WHERE id = ? AND status = 'paid'`).
   */
  onTransition?: (record: T, update: ShipmentUpdate) => void | Promise<void>;
}

export interface SyncShipmentsResult {
  /** Another run holds the lock: nothing was done. */
  skipped: boolean;
  processed: number;
  refreshed: number;
  /** Shipments whose progress changed. */
  changed: number;
  shipped: number;
  delivered: number;
  terminal: number;
  failed: number;
  errors: Array<{ id: string | number; reference: string; message: string }>;
}

function emptyResult(skipped: boolean): SyncShipmentsResult {
  return {
    skipped,
    processed: 0,
    refreshed: 0,
    changed: 0,
    shipped: 0,
    delivered: 0,
    terminal: 0,
    failed: 0,
    errors: [],
  };
}

export async function syncShipments<T extends TrackedShipment>(
  options: SyncShipmentsOptions<T>,
): Promise<SyncShipmentsResult> {
  const { client, store } = options;
  const classify = options.classifyStatus ?? classifyShipmentStatus;
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 20)));

  if (store.acquireLock && !(await store.acquireLock(options.lockTtlMs ?? 5 * 60_000))) {
    return emptyResult(true);
  }

  const result = emptyResult(false);
  try {
    const records = await store.listOpen(limit);
    for (const record of records) {
      result.processed += 1;
      try {
        const shipment = await client.getShipment(record.reference, {
          includeLabels: (options.includeLabels ?? true) && !record.labelUrl,
        });
        const previousProgress = classify(record.status);
        const progress = classify(shipment.status);
        const update: ShipmentUpdate = {
          shipment,
          previousProgress,
          progress,
          statusChanged: shipment.status !== record.status,
          progressChanged: progress !== previousProgress,
          final: isFinalProgress(progress),
          syncedAt: new Date(),
        };

        if (update.progressChanged) await options.onTransition?.(record, update);
        await store.save(record, update);

        result.refreshed += 1;
        if (update.progressChanged) {
          result.changed += 1;
          if (progress === "shipped") result.shipped += 1;
          if (progress === "delivered") result.delivered += 1;
          if (progress === "terminal") result.terminal += 1;
        }
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          id: record.id,
          reference: record.reference,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  } finally {
    if (store.releaseLock) {
      try {
        await store.releaseLock();
      } catch (error) {
        // The lease expires on its own after `lockTtlMs`: not worth failing the run.
        console.error("[packlink-sync] lock not released.", error);
      }
    }
  }
}

export interface MemoryShipmentStore extends ShipmentSyncStore<TrackedShipment> {
  /** Current records, including final ones. */
  readonly records: ReadonlyArray<TrackedShipment & { final: boolean; syncedAt: Date | null }>;
  add(record: TrackedShipment): void;
}

/**
 * In-memory store for tests, demos and single-process scripts. State is lost
 * on restart and not shared between instances: use your database in production.
 */
export function createMemoryShipmentStore(initial: TrackedShipment[] = []): MemoryShipmentStore {
  const records = new Map<string, TrackedShipment & { final: boolean; syncedAt: Date | null }>();
  let lockedUntil = 0;

  const add = (record: TrackedShipment) => {
    records.set(String(record.id), { ...record, final: false, syncedAt: null });
  };
  initial.forEach(add);

  return {
    get records() {
      return [...records.values()];
    },
    add,
    async listOpen(limit) {
      return [...records.values()]
        .filter((record) => !record.final)
        .sort((a, b) => (a.syncedAt?.getTime() ?? 0) - (b.syncedAt?.getTime() ?? 0))
        .slice(0, limit)
        .map(({ id, reference, status, labelUrl }) => ({ id, reference, status, labelUrl }));
    },
    async save(record, update) {
      const current = records.get(String(record.id));
      if (!current) return;
      current.status = update.shipment.status;
      current.labelUrl = update.shipment.labelUrl ?? current.labelUrl ?? null;
      current.final = update.final;
      current.syncedAt = update.syncedAt;
    },
    async acquireLock(ttlMs) {
      const now = Date.now();
      if (lockedUntil > now) return false;
      lockedUntil = now + ttlMs;
      return true;
    },
    async releaseLock() {
      lockedUntil = 0;
    },
  };
}
