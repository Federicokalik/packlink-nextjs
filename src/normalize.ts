// Packlink field names vary between endpoints and API revisions (`state` vs
// `status`, `trackingnumber` vs `tracking_number`, `lat` vs `latitude`…).
// Everything is read defensively here, so the rest of the package only ever
// sees the documented shapes in `types.ts`.

import type { PacklinkDropoffPoint, PacklinkService, PacklinkShipment } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const string = String(value).trim();
  return string ? string : null;
}

function coordinate(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** `null` for services without a usable id or price: they cannot be sold. */
export function toService(value: unknown): PacklinkService | null {
  const raw = record(value);
  const net = Number(raw.base_price);
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
    dropoff: raw.dropoff === true || raw.dropoff === "true" || raw.dropoff === 1,
    raw,
  };
}

/** `null` for points without an id: they cannot be selected. */
export function toDropoffPoint(value: unknown): PacklinkDropoffPoint | null {
  const raw = record(value);
  const id = text(raw.id ?? raw.reference);
  if (!id) return null;
  const hours = raw.opening_times;
  return {
    id,
    name: text(raw.commerce_name ?? raw.name) ?? "",
    address: text(raw.address ?? raw.street1) ?? "",
    city: text(raw.city) ?? "",
    zip: text(raw.zip ?? raw.zip_code) ?? "",
    latitude: coordinate(raw.lat ?? raw.latitude),
    longitude: coordinate(raw.long ?? raw.lng ?? raw.longitude),
    openingHours:
      hours !== null && typeof hours === "object" && !Array.isArray(hours)
        ? (hours as Record<string, string>)
        : null,
    raw,
  };
}

export function toShipment(value: unknown, fallbackReference: string): PacklinkShipment {
  const raw = record(value);
  const labels = raw.labels;
  const firstLabel = Array.isArray(labels) && typeof labels[0] === "string" ? labels[0] : null;
  return {
    reference: text(raw.reference ?? raw.id) ?? fallbackReference,
    status: text(raw.state ?? raw.status),
    trackingNumber: text(raw.trackingnumber ?? raw.tracking_number),
    trackingUrl: text(raw.carrier_tracking_url ?? raw.tracking_url),
    labelUrl: firstLabel ?? text(raw.label_url),
    raw,
  };
}
