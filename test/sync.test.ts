import { describe, expect, it, vi } from "vitest";

import {
  createMemoryShipmentStore,
  PacklinkError,
  syncShipments,
  type PacklinkShipment,
} from "../src";

function shipment(reference: string, status: string | null): PacklinkShipment {
  return { reference, status, trackingNumber: null, trackingUrl: null, labelUrl: null, raw: {} };
}

function clientWith(statuses: Record<string, string | null | Error>) {
  return {
    getShipment: vi.fn(async (reference: string) => {
      const status = statuses[reference];
      if (status instanceof Error) throw status;
      return shipment(reference, status ?? null);
    }),
  };
}

describe("syncShipments", () => {
  it("saves every refresh and reports transitions once", async () => {
    const store = createMemoryShipmentStore([
      { id: 1, reference: "A", status: null },
      { id: 2, reference: "B", status: "IN_TRANSIT" },
      { id: 3, reference: "C", status: "READY_TO_PRINT" },
    ]);
    const client = clientWith({ A: "IN_TRANSIT", B: "DELIVERED", C: "READY_FOR_COLLECTION" });
    const onTransition = vi.fn();

    const first = await syncShipments({ client, store, onTransition });
    expect(first).toMatchObject({
      skipped: false,
      processed: 3,
      refreshed: 3,
      changed: 2,
      shipped: 1,
      delivered: 1,
      failed: 0,
    });
    expect(onTransition).toHaveBeenCalledTimes(2);
    expect(onTransition.mock.calls.map(([record, update]) => [record.id, update.progress])).toEqual(
      [
        [1, "shipped"],
        [2, "delivered"],
      ],
    );

    // Delivered shipments are final and no longer polled; nothing changed for the others.
    client.getShipment.mockClear();
    const second = await syncShipments({ client, store, onTransition });
    expect(second).toMatchObject({ processed: 2, changed: 0 });
    expect(client.getShipment).not.toHaveBeenCalledWith("B");
    expect(store.records.find((record) => record.id === 2)).toMatchObject({ final: true });
  });

  it("does not save when the transition hook fails, so the next run retries it", async () => {
    const store = createMemoryShipmentStore([{ id: 1, reference: "A", status: null }]);
    const client = clientWith({ A: "IN_TRANSIT" });
    const onTransition = vi.fn().mockRejectedValueOnce(new Error("mail down"));

    const failed = await syncShipments({ client, store, onTransition });
    expect(failed).toMatchObject({ failed: 1, refreshed: 0 });
    expect(failed.errors[0]).toEqual({ id: 1, reference: "A", message: "mail down" });
    expect(store.records[0]!.status).toBeNull();

    const retried = await syncShipments({ client, store, onTransition });
    expect(retried).toMatchObject({ failed: 0, shipped: 1 });
    expect(onTransition).toHaveBeenCalledTimes(2);
  });

  it("keeps going when one shipment fails", async () => {
    const store = createMemoryShipmentStore([
      { id: 1, reference: "A", status: null },
      { id: 2, reference: "B", status: null },
    ]);
    const client = clientWith({
      A: new PacklinkError("Packlink GET /shipments/A responded 404", {
        code: "http",
        status: 404,
      }),
      B: "IN_TRANSIT",
    });
    const result = await syncShipments({ client, store });
    expect(result).toMatchObject({ processed: 2, refreshed: 1, failed: 1, shipped: 1 });
  });

  it("skips the run while another one holds the lock, and always releases it", async () => {
    const store = createMemoryShipmentStore([{ id: 1, reference: "A", status: null }]);
    const client = clientWith({ A: null });

    expect(await store.acquireLock!(60_000)).toBe(true);
    expect(await syncShipments({ client, store })).toMatchObject({ skipped: true, processed: 0 });
    expect(client.getShipment).not.toHaveBeenCalled();
    await store.releaseLock!();

    const broken = { ...store, listOpen: vi.fn().mockRejectedValue(new Error("db down")) };
    await expect(syncShipments({ client, store: broken })).rejects.toThrow("db down");
    expect(await store.acquireLock!(60_000)).toBe(true);
  });

  it("respects the batch limit", async () => {
    const store = createMemoryShipmentStore(
      Array.from({ length: 30 }, (_, index) => ({
        id: index,
        reference: `R${index}`,
        status: null,
      })),
    );
    const result = await syncShipments({ client: clientWith({}), store, limit: 5 });
    expect(result.processed).toBe(5);
  });
});
