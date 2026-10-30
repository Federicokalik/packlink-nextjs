// Packlink field names vary between endpoints and API revisions (`state` vs
// `status`, `packlink_reference` vs `reference`, `lat` vs `latitude`…).
// Everything is read defensively here, so the rest of the package only ever
// sees the documented shapes in `types.ts`.
//
// The primary field names follow the responses used by Packlink's own
// open-source module core (github.com/packlink-dev/ecommerce_module_core).

import type {
  PacklinkDropoffPoint,
  PacklinkPostalCode,
  PacklinkPostalZone,
  PacklinkService,
  PacklinkShipment,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return null;
  const string = String(value).trim();
  return string ? string : null;
}

function coordinate(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function flag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

/** `{ name: "Madrid" }` or `"Madrid"`, depending on the endpoint. */
function name(value: unknown): string | null {
  return typeof value === "object" ? text(record(value).name) : text(value);
}

/** `null` for services without a usable id or price: they cannot be sold. */
export function toService(value: unknown): PacklinkService | null {
  const raw = record(value);
  const net = Number(raw.base_price ?? record(raw.price).base_price);
  const serviceId = Number(raw.id);
  if (!Number.isFinite(net) || net <= 0 || !Number.isFinite(serviceId) || serviceId <= 0) {
    return null;
  }
  return {
    serviceId,
    serviceName: text(raw.name) ?? "",
    carrierName: text(raw.carrier_name) ?? "",
    netCents: Math.round(net * 100),
    transitTime: text(raw.transit_time),
    requiresDropoffPoint: flag(raw.delivery_to_parcelshop),
    senderDropoff: flag(raw.dropoff),
    raw,
  };
}

/** Opening times arrive wrapped once more: `{ opening_times: { monday: "…" } }`. */
function openingHours(value: unknown): Record<string, string> | null {
  const outer = record(value);
  const inner = record(outer.opening_times);
  const source = Object.keys(inner).length > 0 ? inner : outer;
  const hours: Record<string, string> = {};
  for (const [day, dayHours] of Object.entries(source)) {
    const cleaned = text(dayHours);
    if (cleaned) hours[day] = cleaned;
  }
  return Object.keys(hours).length > 0 ? hours : null;
}

/** `null` for points without an id: they cannot be selected. */
export function toDropoffPoint(value: unknown): PacklinkDropoffPoint | null {
  const raw = record(value);
  const id = text(raw.id ?? raw.reference);
  if (!id) return null;
  return {
    id,
    name: text(raw.commerce_name ?? raw.name) ?? "",
    address: text(raw.address ?? raw.street1) ?? "",
    city: text(raw.city) ?? "",
    zip: text(raw.zip ?? raw.zip_code) ?? "",
    latitude: coordinate(raw.lat ?? raw.latitude),
    longitude: coordinate(raw.long ?? raw.lng ?? raw.longitude),
    openingHours: openingHours(raw.opening_times),
    raw,
  };
}

export function toShipment(value: unknown, fallbackReference: string): PacklinkShipment {
  const raw = record(value);
  const trackings = Array.isArray(raw.trackings)
    ? raw.trackings
    : Array.isArray(raw.tracking_codes)
      ? raw.tracking_codes
      : [];
  const trackingNumbers = [
    ...trackings.map(text),
    text(raw.trackingnumber ?? raw.tracking_number),
  ].filter((code, index, all): code is string => code !== null && all.indexOf(code) === index);
  const labels = Array.isArray(raw.labels) ? raw.labels.map(text) : [];
  return {
    reference: text(raw.packlink_reference ?? raw.reference ?? raw.id) ?? fallbackReference,
    status: text(raw.state ?? raw.status),
    trackingNumber: trackingNumbers[0] ?? null,
    trackingNumbers,
    trackingUrl: text(raw.tracking_url ?? raw.carrier_tracking_url),
    labelUrl: labels.find((label) => label !== null) ?? text(raw.label_url),
    raw,
  };
}

/** Exact lookup (`/locations/postalcodes/{country}/{zip}`): nested objects for each level. */
export function toPostalCode(value: unknown): PacklinkPostalCode | null {
  const raw = record(value);
  const zip = text(raw.zipcode ?? raw.zip);
  if (!zip) return null;
  const city = name(raw.city) ?? "";
  return {
    id: text(raw.id) ?? zip,
    zip,
    city,
    province: name(raw.province),
    state: name(raw.state),
    countryCode: text(record(raw.country).isoCode)?.toUpperCase() ?? null,
    label: text(raw.zipcodeCity ?? raw.text) ?? [zip, city].filter(Boolean).join(" - "),
    latitude: coordinate(raw.latitude),
    longitude: coordinate(raw.longitude),
    raw,
  };
}

/** Search (`/locations/postalcodes?q=`): flat strings, no province or coordinates. */
export function toPostalCodeMatch(value: unknown, countryCode: string): PacklinkPostalCode | null {
  const match = toPostalCode(value);
  return match ? { ...match, countryCode: match.countryCode ?? countryCode } : null;
}

export function toPostalZone(value: unknown): PacklinkPostalZone | null {
  const raw = record(value);
  const id = text(raw.id);
  const countryCode = text(raw.isoCode)?.toUpperCase();
  if (!id || !countryCode) return null;
  return {
    id,
    name: text(raw.name) ?? "",
    countryCode,
    // `null` in some responses: only an explicit `false` rules a zone out.
    hasPostalCodes: raw.hasPostalCodes !== false,
    phonePrefix: text(raw.phonePrefix),
    raw,
  };
}
