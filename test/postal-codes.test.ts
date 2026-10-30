import { describe, expect, it } from "vitest";

import { createPacklinkClient } from "../src";
import { jsonResponse, mockFetch, SENDER } from "./helpers";

const lookupHit = {
  id: "pc_it_1234",
  zipcode: "03100",
  zipcodeCity: "03100 - Frosinone",
  city: { name: "Frosinone" },
  province: { name: "Frosinone" },
  state: { name: "Lazio" },
  country: { isoCode: "IT", name: "Italia" },
  latitude: "41.64",
  longitude: "13.34",
};

const zones = [
  { id: "113", isoCode: "IT", hasPostalCodes: true, name: "Italia" },
  { id: "114", isoCode: "IT", hasPostalCodes: null, name: "Italia - Isole" },
  { id: "115", isoCode: "IT", hasPostalCodes: false, name: "Italia - Senza CAP" },
  { id: "65", isoCode: "ES", hasPostalCodes: true, name: "España" },
];

describe("lookupPostalCode", () => {
  it("returns the place of an exact zip code", async () => {
    const { fetch, calls } = mockFetch(jsonResponse([lookupHit]));
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    const [match] = await client.lookupPostalCode({ country: "it", zip: "03100" });

    expect(calls[0]!.url.pathname).toBe("/v1/locations/postalcodes/IT/03100");
    expect(match).toMatchObject({
      zip: "03100",
      city: "Frosinone",
      province: "Frosinone",
      state: "Lazio",
      countryCode: "IT",
      label: "03100 - Frosinone",
      latitude: 41.64,
      longitude: 13.34,
    });
  });

  it("answers with an empty list for unknown zip codes, and throws on real failures", async () => {
    const { fetch } = mockFetch(
      new Response('{"messages":[{"message":"Location not valid for the input data"}]}', {
        status: 400,
      }),
      new Response("", { status: 404 }),
      new Response('{"messages":[{"message":"Bad request"}]}', { status: 400 }),
      new Response("down", { status: 503 }),
    );
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    expect(await client.lookupPostalCode({ country: "IT", zip: "99999" })).toEqual([]);
    expect(await client.lookupPostalCode({ country: "IT", zip: "99998" })).toEqual([]);
    await expect(client.lookupPostalCode({ country: "IT", zip: "x" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(client.lookupPostalCode({ country: "IT", zip: "1" })).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe("listPostalZones / searchPostalCodes", () => {
  it("keeps the zones of the country and caches them", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(zones));
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });

    const first = await client.listPostalZones({ country: "IT" });
    const second = await client.listPostalZones({ country: "it" });
    expect(first.map((zone) => [zone.id, zone.hasPostalCodes])).toEqual([
      ["113", true],
      ["114", true],
      ["115", false],
    ]);
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
      platform: "PRO",
      platform_country: "IT",
      language: "en",
    });
  });

  it("searches every zone with postal codes and merges the matches", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(zones),
      jsonResponse([
        { id: "pc_it_1", text: "03100 - Frosinone", city: "Frosinone", zipcode: "03100" },
        { id: "pc_it_2", text: "03011 - Alatri", city: "Alatri", zipcode: "03011" },
      ]),
      jsonResponse([
        { id: "pc_it_1", text: "03100 - Frosinone", city: "Frosinone", zipcode: "03100" },
      ]),
    );
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    const matches = await client.searchPostalCodes({ country: "IT", query: " fro " });

    expect(calls.slice(1).map((call) => call.url.searchParams.get("postalzone"))).toEqual([
      "113",
      "114",
    ]);
    expect(calls[1]!.url.pathname).toBe("/v1/locations/postalcodes");
    expect(calls[1]!.url.searchParams.get("q")).toBe("fro");
    expect(matches.map((match) => [match.zip, match.city, match.countryCode, match.label])).toEqual(
      [
        ["03100", "Frosinone", "IT", "03100 - Frosinone"],
        ["03011", "Alatri", "IT", "03011 - Alatri"],
      ],
    );
  });

  it("searches a single zone when given, and rejects too short queries", async () => {
    const { fetch, calls } = mockFetch(jsonResponse([]));
    const client = createPacklinkClient({ apiKey: "k", sender: SENDER, fetch });
    await client.searchPostalCodes({ country: "IT", query: "031", postalZoneId: "113" });
    expect(calls).toHaveLength(1);
    await expect(client.searchPostalCodes({ country: "IT", query: "0" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});
