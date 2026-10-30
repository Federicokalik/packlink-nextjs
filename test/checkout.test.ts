import { describe, expect, it, vi } from "vitest";

import { priceWithVatAndMarkup, resolveShippingOptions, type PacklinkService } from "../src";

function service(overrides: Partial<PacklinkService>): PacklinkService {
  return {
    serviceId: 1,
    serviceName: "Standard",
    carrierName: "BRT",
    netCents: 1000,
    transitTime: null,
    dropoff: false,
    raw: {},
    ...overrides,
  };
}

const pickup = { id: "pickup", label: "In-store pickup", amountCents: 0, kind: "custom" as const };
const rules = { flatRateCents: 990, freeThresholdCents: 7900, vatPct: 22, markupPct: 10 };
const base = {
  destination: { zip: "20121", country: "IT" },
  parcel: { weightGrams: 1000, dimensionsMm: null, complete: true },
  subtotalCents: 5000,
  rules,
  extraOptions: [pickup],
};

describe("priceWithVatAndMarkup", () => {
  it("applies VAT, then the markup, and rounds to the cent", () => {
    expect(priceWithVatAndMarkup(1000, { vatPct: 22, markupPct: 10 })).toBe(1342);
    expect(priceWithVatAndMarkup(999)).toBe(999);
  });
});

describe("resolveShippingOptions", () => {
  it("offers live Packlink options with VAT and markup, plus the extras", async () => {
    const listServices = vi.fn(async () => [service({ serviceId: 7, dropoff: true })]);
    const options = await resolveShippingOptions({ configured: true, listServices }, base);

    expect(options).toEqual([
      {
        id: "packlink-7",
        label: "BRT — Standard",
        amountCents: 1342,
        kind: "packlink",
        packlinkServiceId: 7,
        requiresDropoff: true,
        carrierName: "BRT",
        serviceName: "Standard",
        transitTime: null,
      },
      pickup,
    ]);
    expect(listServices).toHaveBeenCalledWith(
      expect.objectContaining({ to: { zip: "20121", country: "IT" }, includeDropoff: true }),
    );
  });

  it("is free above the threshold without asking Packlink", async () => {
    const listServices = vi.fn();
    const options = await resolveShippingOptions(
      { configured: true, listServices },
      { ...base, subtotalCents: 7900 },
    );
    expect(options[0]).toMatchObject({ id: "flat", amountCents: 0, kind: "free" });
    expect(listServices).not.toHaveBeenCalled();
  });

  it("falls back to the flat rate when Packlink fails or has nothing", async () => {
    const onError = vi.fn();
    const failing = {
      configured: true,
      listServices: vi.fn(async () => Promise.reject(new Error("down"))),
    };
    const failed = await resolveShippingOptions(failing, { ...base, onError });
    expect(failed[0]).toMatchObject({ id: "flat", amountCents: 990, kind: "flat" });
    expect(onError).toHaveBeenCalledOnce();

    const empty = { configured: true, listServices: vi.fn(async () => []) };
    expect((await resolveShippingOptions(empty, base))[0]).toMatchObject({ id: "flat" });
  });

  it("skips live quotes for incomplete parcels, missing zip, or when disabled", async () => {
    const listServices = vi.fn(async () => [service({})]);
    const client = { configured: true, listServices };
    await resolveShippingOptions(client, { ...base, parcel: { ...base.parcel, complete: false } });
    await resolveShippingOptions(client, { ...base, destination: { country: "IT" } });
    await resolveShippingOptions(client, { ...base, rules: { ...rules, liveQuotes: false } });
    await resolveShippingOptions({ configured: false, listServices }, base);
    expect(listServices).not.toHaveBeenCalled();
  });
});
