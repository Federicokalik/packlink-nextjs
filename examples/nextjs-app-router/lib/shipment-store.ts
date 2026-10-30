import "server-only";

import type { ShipmentSyncStore, ShipmentUpdate, TrackedShipment } from "packlink-nextjs";

import { db } from "./db";

const LOCK = "packlink-sync";

/** `syncShipments` reads and writes the orders table through this. */
export const shipmentStore: ShipmentSyncStore = {
  async listOpen(limit) {
    const { rows } = await db.execute({
      sql: `SELECT id, packlink_reference AS reference, packlink_status AS status,
                   packlink_label_url AS label_url
            FROM orders
            WHERE packlink_reference IS NOT NULL
              AND packlink_reference NOT LIKE 'pending:%'
              AND packlink_final_at IS NULL
              AND status NOT IN ('cancelled', 'refunded', 'completed')
            ORDER BY COALESCE(packlink_synced_at, created_at) ASC
            LIMIT ?`,
      args: [limit],
    });
    return rows.map((row) => ({
      id: Number(row.id),
      reference: String(row.reference),
      status: row.status === null ? null : String(row.status),
      labelUrl: row.label_url === null ? null : String(row.label_url),
    }));
  },

  async save(record, { shipment, final }) {
    // COALESCE: a label without tracking yet must not erase a tracking number typed by hand.
    await db.execute({
      sql: `UPDATE orders SET
              packlink_status    = ?,
              packlink_label_url = COALESCE(?, packlink_label_url),
              tracking_number    = COALESCE(?, tracking_number),
              tracking_url       = COALESCE(?, tracking_url),
              packlink_synced_at = datetime('now'),
              packlink_final_at  = CASE WHEN ? THEN COALESCE(packlink_final_at, datetime('now'))
                                        ELSE packlink_final_at END
            WHERE id = ? AND packlink_reference = ?`,
      args: [
        shipment.status,
        shipment.labelUrl,
        shipment.trackingNumber,
        shipment.trackingUrl,
        final ? 1 : 0,
        record.id,
        record.reference,
      ],
    });
  },

  async acquireLock(ttlMs) {
    const result = await db.execute({
      sql: `INSERT INTO job_locks (name, locked_until) VALUES (?, datetime('now', ?))
            ON CONFLICT (name) DO UPDATE SET locked_until = excluded.locked_until
            WHERE job_locks.locked_until < datetime('now')`,
      args: [LOCK, `+${Math.ceil(ttlMs / 1000)} seconds`],
    });
    return result.rowsAffected > 0;
  },

  async releaseLock() {
    await db.execute({
      sql: `UPDATE job_locks SET locked_until = datetime('now') WHERE name = ?`,
      args: [LOCK],
    });
  },
};

/**
 * Moves the order forward when the parcel does. Idempotent on purpose: it can
 * run again for the same transition if the save that follows it fails. The
 * WHERE clause also guarantees that tracking never touches an unpaid,
 * cancelled or refunded order.
 */
export async function onTransition(record: TrackedShipment, update: ShipmentUpdate) {
  if (update.progress === "shipped") {
    const result = await db.execute({
      sql: `UPDATE orders SET status = 'shipped' WHERE id = ? AND status IN ('paid', 'processing')`,
      args: [record.id],
    });
    if (result.rowsAffected > 0) {
      // First time only: this is the place for the "your order is on its way" email.
    }
  } else if (update.progress === "delivered") {
    await db.execute({
      sql: `UPDATE orders SET status = 'completed'
            WHERE id = ? AND status IN ('paid', 'processing', 'shipped')`,
      args: [record.id],
    });
  }
}
