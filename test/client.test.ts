import { describe, expect, it } from "vitest";

import { createPacklinkClient, isPacklinkError, PacklinkError } from "../src";
import { jsonResponse, mockFetch, SENDER } from "./helpers";

const services = [
  { id: 3, name: "Express", carrier_name: "BRT", base_price: "9.80", transit_time: "1 day" },
  // Sender drops it off, but it is delivered to the door: no pickup point to choose.
  { id: 1, name: "Standard", carrier_name: "Poste Italiane", base_price: 6.5, dropoff: true },
  {
    id: 2,
    name: "Punto",
    carrier_name: "InPost",
    price: { base_price: 4.1 },
    dropoff: true,
    delivery_to_parcelshop: true,
  },
  { id: 0, name: "Broken", carrier_name: "X", base_price: 1 },
  { id: 9, name: "Free?", carrier_name: "Y", base_price: 0 },
];

describe("listServices", () => {
  it("quotes the route with the API key as-is and converts units", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(services));
    const client = createPacklinkClient({ apiKey: "\uFEFF secret-key ", sender: SENDER, fetch });

    const result = await client.listServices({
      to: { zip: " 20121 ", country: "it" },
      parcels: [{ weightGrams: 1530, dimensionsMm: { lengthMm: 304, widthMm: 196, heightMm: 4 } }],
    });

    const call = calls[0]!;
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe("/v1/services");
    expect(call.headers.get("authorization")).toBe("secret-key");
    expect(Object.fromEntries(call.url.searchParams)).toEqual({
      "from[country]": "IT",
      "from[zip]": "03100",
      "to[country]": "IT",
      "to[zip]": "20121",
      "packages[0][weight]": "1.53",
      "packages[0][width]": "20",
      "packages[0][height]": "1",
      "packages[0][length]": "30",
      sortBy: "totalPrice",
    });
    expect(
      result.map((service) => [service.serviceId, service.netCents, service.requiresDropoffPoint]),
    ).toEqual([
      [2, 410, true],
      [1, 650, false],
      [3, 980, false],
    ]);
    expect(result[2]!.transitTime).toBe("1 day");
  });

  it("uses a 20 cm box and 100 g minimum when the parcel has no data", async () => {
    const { fetch, calls } = mockFetch(jsonResponse([]));
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    await client.listServices({
      to: { zip: "00100", country: "IT" },
      parcels: [{ weightGrams: 0 }],
    });
    const params = calls[0]!.url.searchParams;
    expect(params.get("packages[0][weight]")).toBe("0.10");
    expect(params.get("packages[0][width]")).toBe("20");
    expect(params.get("packages[0][length]")).toBe("20");
  });

  it("drops disabled carriers ignoring case and accents, and pickup services on request", async () => {
    const { fetch } = mockFetch(jsonResponse(services));
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    const result = await client.listServices({
      to: { zip: "00100", country: "IT" },
      parcels: [{ weightGrams: 500 }],
      disabledCarriers: ["poste-italiane"],
      includeDropoffPoint: false,
    });
    expect(result.map((service) => service.serviceId)).toEqual([3]);
  });

  it("refuses to call Packlink without key, sender or valid destination", async () => {
    const { fetch, calls } = mockFetch();
    const noKey = createPacklinkClient({ apiKey: " ", sender: SENDER, fetch });
    expect(noKey.configured).toBe(false);
    await expect(
      noKey.listServices({ to: { zip: "1", country: "IT" }, parcels: [{ weightGrams: 1 }] }),
    ).rejects.toMatchObject({ code: "not_configured" });

    const noSender = createPacklinkClient({ apiKey: "k", fetch });
    await expect(
      noSender.listServices({ to: { zip: "1", country: "IT" }, parcels: [{ weightGrams: 1 }] }),
    ).rejects.toMatchObject({ code: "not_configured" });

    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    await expect(
      client.listServices({ to: { zip: "", country: "IT" }, parcels: [{ weightGrams: 1 }] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      client.listServices({ to: { zip: "1", country: "ITA" }, parcels: [{ weightGrams: 1 }] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(calls).toHaveLength(0);
  });

  it("turns HTTP and network failures into PacklinkError", async () => {
    const { fetch } = mockFetch(
      new Response('{"message":"invalid zip"}', { status: 422 }),
      new TypeError("fetch failed"),
      new Response("<html>", { status: 200 }),
    );
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    const input = { to: { zip: "00100", country: "IT" }, parcels: [{ weightGrams: 1 }] };

    const http = await client.listServices(input).catch((error: unknown) => error);
    expect(isPacklinkError(http)).toBe(true);
    expect(http).toBeInstanceOf(PacklinkError);
    expect(http).toMatchObject({ code: "http", status: 422, body: '{"message":"invalid zip"}' });
    expect((http as Error).message).toContain("invalid zip");

    await expect(client.listServices(input)).rejects.toMatchObject({ code: "network" });
    await expect(client.listServices(input)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("sends the default fetch options and lets them be replaced", async () => {
    const seen: RequestInit[] = [];
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      seen.push(init ?? {});
      return jsonResponse([]);
    }) as typeof globalThis.fetch;
    const input = { to: { zip: "00100", country: "IT" }, parcels: [{ weightGrams: 1 }] };

    await createPacklinkClient({ apiKey: "k", sender: SENDER, fetch }).listServices(input);
    await createPacklinkClient({ apiKey: "k", sender: SENDER, fetch, fetchInit: {} }).listServices(
      input,
    );
    expect(seen[0]!.cache).toBe("no-store");
    expect(seen[1]!.cache).toBeUndefined();
  });
});

describe("listDropoffs", () => {
  it("normalizes the field names Packlink uses", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse([
        {
          id: "P1",
          commerce_name: "Tabacchi",
          address: "Via Po 2",
          city: "Roma",
          zip: "00100",
          lat: "41.9",
          long: "12.5",
          opening_times: { monday: "9-18" },
        },
        { reference: "P2", name: "Edicola", street1: "Via Tevere 3", zip_code: "00101" },
        { name: "no id" },
      ]),
    );
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    const points = await client.listDropoffs({ serviceId: 22, country: "it", zip: "00 100" });

    expect(calls[0]!.url.pathname).toBe("/v1/dropoffs/22/IT/00%20100");
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      id: "P1",
      name: "Tabacchi",
      latitude: 41.9,
      longitude: 12.5,
      openingHours: { monday: "9-18" },
    });
    expect(points[1]).toMatchObject({
      id: "P2",
      name: "Edicola",
      address: "Via Tevere 3",
      zip: "00101",
      latitude: null,
      longitude: null,
    });
  });
});

describe("shipments", () => {
  const to = {
    name: "Ada",
    street1: "Via Verdi 3",
    city: "Milano",
    zip: "20121",
    country: "it",
    email: "ada@example.com",
  };

  it("creates a shipment with the Packlink payload", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ reference: "IT2026ABC" }));
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch, currency: "EUR" });

    const shipment = await client.createShipment({
      serviceId: 3,
      to,
      parcels: [
        { weightGrams: 2500, dimensionsMm: { lengthMm: 400, widthMm: 300, heightMm: 250 } },
      ],
      content: "1 sewing machine",
      contentValueCents: 34990,
      customReference: "CV-1001",
      dropoffPointId: "P1",
    });

    expect(shipment.reference).toBe("IT2026ABC");
    const call = calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/v1/shipments");
    expect(call.headers.get("content-type")).toBe("application/json");
    expect(call.body).toMatchObject({
      service_id: 3,
      content: "1 sewing machine",
      contentvalue: 349.9,
      contentValue_currency: "EUR",
      shipment_custom_reference: "CV-1001",
      dropoff_point_id: "P1",
      from: { name: "Shop", surname: "-", zip_code: "03100", country: "IT" },
      to: { name: "Ada", surname: "-", zip_code: "20121", country: "IT" },
      packages: [{ weight: 2.5, width: 30, height: 25, length: 40 }],
    });
  });

  it("never calls Packlink with an incomplete address", async () => {
    const { fetch, calls } = mockFetch();
    const client = createPacklinkClient({
      apiKey: "k",
      sender: { zip: "03100", country: "IT" },
      fetch,
    });
    const input = {
      serviceId: 3,
      to,
      parcels: [{ weightGrams: 1 }],
      content: "x",
      contentValueCents: 1,
    };

    await expect(client.createShipment(input)).rejects.toMatchObject({ code: "not_configured" });
    const full = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    await expect(full.createShipment({ ...input, to: { ...to, city: "" } })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(calls).toHaveLength(0);
  });

  it("fails when Packlink returns no reference", async () => {
    const { fetch } = mockFetch(jsonResponse({}));
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    await expect(
      client.createShipment({
        serviceId: 3,
        to,
        parcels: [{ weightGrams: 1 }],
        content: "x",
        contentValueCents: 1,
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("reads status, tracking and label whatever the field names", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse({
        state: "IN_TRANSIT",
        trackingnumber: "BRT123",
        carrier_tracking_url: "https://track.example/BRT123",
        labels: ["https://labels.example/1.pdf"],
      }),
      jsonResponse({ status: "DELIVERED", tracking_number: "X", label_url: "https://l/2.pdf" }),
    );
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });

    expect(await client.getShipment("IT 1")).toMatchObject({
      reference: "IT 1",
      status: "IN_TRANSIT",
      trackingNumber: "BRT123",
      trackingUrl: "https://track.example/BRT123",
      labelUrl: "https://labels.example/1.pdf",
    });
    expect(calls[0]!.url.pathname).toBe("/v1/shipments/IT%201");
    expect(await client.getShipment("IT2")).toMatchObject({
      status: "DELIVERED",
      trackingNumber: "X",
      labelUrl: "https://l/2.pdf",
    });
  });

  it("cancels with DELETE", async () => {
    const { fetch, calls } = mockFetch(new Response(null, { status: 204 }));
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    await client.cancelShipment("IT2026ABC");
    expect(calls[0]).toMatchObject({ method: "DELETE" });
    expect(calls[0]!.url.pathname).toBe("/v1/shipments/IT2026ABC");
  });
});

describe("official response shapes", () => {
  // Field names as in the responses used by Packlink's open-source module core.
  it("reads reference and tracking numbers from a shipment", async () => {
    const { fetch } = mockFetch(
      jsonResponse({
        packlink_reference: "IT2026XYZ",
        state: "IN_TRANSIT",
        trackings: ["31016279", "31016280"],
        tracking_url: "https://carrier.example/track",
        carrier: "BRT",
      }),
    );
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    expect(await client.getShipment("IT2026XYZ")).toMatchObject({
      reference: "IT2026XYZ",
      status: "IN_TRANSIT",
      trackingNumber: "31016279",
      trackingNumbers: ["31016279", "31016280"],
      trackingUrl: "https://carrier.example/track",
      labelUrl: null,
    });
  });

  it("asks for the label only when requested, and treats 404 as not ready", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse({ packlink_reference: "A", state: "READY_TO_PRINT" }),
      jsonResponse(["https://labels.example/A.pdf"]),
      jsonResponse({ packlink_reference: "B", state: "READY_TO_PURCHASE" }),
      new Response('{"messages":[]}', { status: 404 }),
      new Response("boom", { status: 500 }),
    );
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });

    expect((await client.getShipment("A", { includeLabels: true })).labelUrl).toBe(
      "https://labels.example/A.pdf",
    );
    expect(calls[1]!.url.pathname).toBe("/v1/shipments/A/labels");
    expect((await client.getShipment("B", { includeLabels: true })).labelUrl).toBeNull();
    await expect(client.getLabels("C")).rejects.toMatchObject({ code: "http", status: 500 });
  });

  it("unwraps the nested opening times of pickup points", async () => {
    const { fetch } = mockFetch(
      jsonResponse([
        {
          id: "164047",
          commerce_name: "Edicola",
          address: "Via Po 2",
          zip: "00100",
          city: "Roma",
          lat: 41.9,
          long: 12.5,
          opening_times: { opening_times: { monday: "09:00-13:00", sunday: "" } },
        },
      ]),
    );
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    const [point] = await client.listDropoffs({ serviceId: 1, country: "IT", zip: "00100" });
    expect(point!.openingHours).toEqual({ monday: "09:00-13:00" });
  });
});
