import { describe, expect, it, vi } from "vitest";

import { PacklinkError, type PacklinkDropoffPoint } from "../src";
import {
  createDropoffsRoute,
  createShippingOptionsRoute,
  createSyncRoute,
  isAuthorizedCronRequest,
} from "../src/next";

const URL_BASE = "https://shop.example.com";

function withAuth(value: string | null, method = "POST") {
  return new Request(`${URL_BASE}/api/jobs/packlink-sync`, {
    method,
    headers: value === null ? {} : { Authorization: value },
  });
}

describe("isAuthorizedCronRequest", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCronRequest(withAuth("Bearer s3cret"), "s3cret")).toBe(true);
    expect(isAuthorizedCronRequest(withAuth("bearer s3cret"), "﻿s3cret ")).toBe(true);
    expect(isAuthorizedCronRequest(withAuth("Bearer s3cre"), "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(withAuth("Bearer s3cretX"), "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(withAuth(null), "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(withAuth("Bearer "), "")).toBe(false);
  });
});

describe("createSyncRoute", () => {
  it("stays closed until a secret is configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn();
    const { POST } = createSyncRoute({ secret: undefined, run });
    const response = await POST(withAuth("Bearer anything"));
    expect(response.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret and runs with the right one on GET and POST", async () => {
    const run = vi.fn(async () => ({ processed: 1 }));
    const { GET, POST } = createSyncRoute({ secret: "s3cret", run });

    expect((await POST(withAuth("Bearer nope"))).status).toBe(401);
    const viaPost = await POST(withAuth("Bearer s3cret"));
    const viaGet = await GET(withAuth("Bearer s3cret", "GET"));
    expect(viaPost.status).toBe(200);
    expect(viaPost.headers.get("cache-control")).toBe("no-store");
    expect(await viaGet.json()).toEqual({ processed: 1 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("exposes Packlink errors but hides others", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const packlink = createSyncRoute({
      secret: "s",
      run: async () => {
        throw new PacklinkError("Packlink API key is not configured.", { code: "not_configured" });
      },
    });
    const other = createSyncRoute({
      secret: "s",
      run: async () => {
        throw new Error("password=hunter2");
      },
    });
    expect(await (await packlink.POST(withAuth("Bearer s"))).json()).toEqual({
      error: "Packlink API key is not configured.",
    });
    expect(await (await other.POST(withAuth("Bearer s"))).json()).toEqual({ error: "sync_failed" });
  });
});

describe("createDropoffsRoute", () => {
  const point: PacklinkDropoffPoint = {
    id: "P1",
    name: "Tabacchi",
    address: "Via Po 2",
    city: "Roma",
    zip: "00100",
    latitude: 1,
    longitude: 2,
    openingHours: null,
    raw: { internal: true },
  };

  it("validates the query and strips the raw payload", async () => {
    const listDropoffs = vi.fn(async () => [point]);
    const { GET } = createDropoffsRoute({ client: { listDropoffs } });

    const bad = await GET(new Request(`${URL_BASE}/x?serviceId=abc&zip=00100&country=IT`));
    expect(bad.status).toBe(400);

    const good = await GET(new Request(`${URL_BASE}/x?serviceId=12&zip=00100&country=it`));
    const body = (await good.json()) as { points: Array<Record<string, unknown>> };
    expect(listDropoffs).toHaveBeenCalledWith({ serviceId: 12, zip: "00100", country: "IT" });
    expect(body.points[0]).not.toHaveProperty("raw");
    expect(body.points[0]).toMatchObject({ id: "P1", name: "Tabacchi" });
  });

  it("answers 502 when Packlink fails", async () => {
    const onError = vi.fn();
    const { GET } = createDropoffsRoute({
      client: { listDropoffs: vi.fn().mockRejectedValue(new Error("down")) },
      onError,
    });
    const response = await GET(new Request(`${URL_BASE}/x?serviceId=12&zip=00100&country=IT`));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "packlink_unavailable", points: [] });
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("createShippingOptionsRoute", () => {
  const client = {
    configured: true,
    listServices: vi.fn(async () => [
      {
        serviceId: 5,
        serviceName: "Express",
        carrierName: "GLS",
        netCents: 1000,
        transitTime: null,
        dropoff: false,
        raw: {},
      },
    ]),
  };

  it("quotes the cart resolved on the server, not what the browser claims", async () => {
    const resolveCart = vi.fn(async () => ({
      subtotalCents: 4200,
      lines: [{ quantity: 2, weightGrams: 300, lengthMm: 200, widthMm: 100, heightMm: 50 }],
    }));
    const { POST } = createShippingOptionsRoute({
      client,
      resolveCart,
      rules: { flatRateCents: 990, vatPct: 22 },
    });

    const response = await POST(
      new Request(`${URL_BASE}/x`, {
        method: "POST",
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 2 }],
          zip: "20121",
          country: "it",
          weightGrams: 1,
        }),
      }),
    );
    const body = (await response.json()) as {
      options: Array<{ id: string; amountCents: number }>;
      subtotalCents: number;
    };
    expect(body.subtotalCents).toBe(4200);
    expect(body.options).toEqual([
      expect.objectContaining({ id: "packlink-5", amountCents: 1220 }),
    ]);
    expect(client.listServices).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { zip: "20121", country: "IT" },
        parcels: [
          {
            weightGrams: 600,
            dimensionsMm: { lengthMm: 200, widthMm: 100, heightMm: 100 },
            complete: true,
          },
        ],
      }),
    );
  });

  it("rejects bodies that are not JSON and empty carts", async () => {
    const { POST } = createShippingOptionsRoute({
      client,
      resolveCart: async () => null,
      rules: { flatRateCents: 990 },
    });
    const notJson = await POST(new Request(`${URL_BASE}/x`, { method: "POST", body: "{" }));
    const empty = await POST(new Request(`${URL_BASE}/x`, { method: "POST", body: "{}" }));
    expect(notJson.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "invalid_cart" });
  });
});
