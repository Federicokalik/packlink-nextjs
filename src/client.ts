// Packlink PRO REST client.
//
// Every method throws a `PacklinkError` when something goes wrong; nothing is
// swallowed here. Degrading gracefully is a decision of the caller and is
// made in one place each: `resolveShippingOptions` falls back to a flat rate,
// the route handlers answer with an error status, the sync counts a failure.
//
// Authentication is the PRO API key sent as-is in `Authorization` — no
// `Bearer` prefix.

import { PacklinkError } from "./errors";
import { toDropoffPoint, toService, toShipment } from "./normalize";
import { toPacklinkPackage } from "./parcel";
import type {
  CountryCode,
  DimensionsMm,
  PacklinkAddress,
  PacklinkDropoffPoint,
  PacklinkService,
  PacklinkShipment,
  Parcel,
  PostalLocation,
} from "./types";

export const PACKLINK_API_BASE_URL = "https://api.packlink.com/v1";

/** Box used for parcels without dimensions: 20 × 20 × 20 cm. */
export const DEFAULT_FALLBACK_DIMENSIONS_MM: DimensionsMm = {
  lengthMm: 200,
  widthMm: 200,
  heightMm: 200,
};

/**
 * Timeouts in milliseconds. Reads are short because a checkout is waiting
 * and has a fallback; writes are generous because giving up halfway through
 * a POST leaves you not knowing whether the shipment was created.
 */
export const DEFAULT_TIMEOUTS = { read: 6_000, write: 20_000 } as const;

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface PacklinkClientOptions {
  /** Packlink PRO API key. When empty the client reports `configured: false`. */
  apiKey: string | null | undefined;
  /** Your warehouse: `zip` and `country` are needed to quote, the full address to ship. */
  sender?: PacklinkAddress;
  baseUrl?: string;
  /** Currency of the declared content value. Default `"EUR"`. */
  currency?: string;
  /** Box size used for parcels without dimensions. */
  fallbackDimensionsMm?: DimensionsMm;
  timeouts?: { read?: number; write?: number };
  /** Custom `fetch`, e.g. for tests or instrumentation. */
  fetch?: typeof fetch;
  /**
   * Extra options merged into every request. The default `{ cache: "no-store" }`
   * keeps Next.js from caching quotes; pass `{}` on runtimes that reject the
   * `cache` option.
   */
  fetchInit?: RequestInit;
}

export interface ListServicesInput {
  to: PostalLocation;
  /** Defaults to the sender's zip and country. */
  from?: PostalLocation;
  parcels: Parcel[];
  /** Carrier names to drop; matched ignoring case, accents and punctuation. */
  disabledCarriers?: string[];
  /** Keep services that need a pickup point. Default `true`. */
  includeDropoff?: boolean;
}

export interface ListDropoffsInput {
  serviceId: number;
  country: CountryCode;
  zip: string;
}

export interface CreateShipmentInput {
  /** `serviceId` of a service returned by `listServices`. */
  serviceId: number;
  to: PacklinkAddress;
  /** Defaults to the client's sender. */
  from?: PacklinkAddress;
  parcels: Parcel[];
  /** Short description of the goods. */
  content: string;
  /** Declared value of the goods, in cents. */
  contentValueCents: number;
  /** Your reference (e.g. the order number), to find the shipment in the Packlink panel. */
  customReference?: string;
  /** Required for services with `dropoff: true`. */
  dropoffPointId?: string | null;
  secondHand?: boolean;
  priority?: boolean;
  /** Raw fields merged into the payload last, for options this package does not model. */
  extra?: Record<string, unknown>;
}

export interface PacklinkClient {
  /** An API key is set. */
  readonly configured: boolean;
  readonly sender: PacklinkAddress | undefined;
  /** Services for the route, cheapest first. */
  listServices(input: ListServicesInput): Promise<PacklinkService[]>;
  /** Pickup points of a service around a zip code. */
  listDropoffs(input: ListDropoffsInput): Promise<PacklinkDropoffPoint[]>;
  /**
   * Creates the shipment. This is billable, and Packlink happily accepts an
   * identical duplicate — make sure the order does not have one already.
   */
  createShipment(input: CreateShipmentInput): Promise<PacklinkShipment>;
  /** Current state, tracking and label. */
  getShipment(reference: string): Promise<PacklinkShipment>;
  cancelShipment(reference: string): Promise<void>;
  /** Escape hatch for endpoints this package does not wrap. `path` starts with `/`. */
  request<T = unknown>(
    method: HttpMethod,
    path: string,
    options?: { body?: unknown; timeoutMs?: number },
  ): Promise<T>;
}

/**
 * Strips the byte order mark and surrounding spaces from a secret.
 *
 * Keys pasted from a dashboard or read from a file can carry an invisible
 * U+FEFF; in an HTTP header it makes the runtime throw "Cannot convert
 * argument to a ByteString" because header values must be Latin-1.
 */
export function cleanSecret(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const cleaned = value.replace(/﻿/g, "").trim();
  return cleaned ? cleaned : undefined;
}

/** Comparable carrier name: "Poste Italiane" and "posteitaliane" are the same carrier. */
export function normalizeCarrierName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function invalid(message: string): PacklinkError {
  return new PacklinkError(message, { code: "invalid_input" });
}

function location(value: Partial<PostalLocation> | undefined, label: string): PostalLocation {
  const zip = String(value?.zip ?? "").trim();
  const country = String(value?.country ?? "")
    .trim()
    .toUpperCase();
  if (!zip) throw invalid(`Missing ${label} zip code.`);
  if (!/^[A-Z]{2}$/.test(country)) throw invalid(`Invalid ${label} country "${country}".`);
  return { zip, country };
}

function missingAddressFields(address: PacklinkAddress | undefined): string[] {
  const required = ["street1", "city", "zip", "country"] as const;
  return required.filter((field) => !String(address?.[field] ?? "").trim());
}

/** Packlink rejects empty names: "-" is what the dashboard itself accepts. */
function toPayloadAddress(address: PacklinkAddress) {
  return {
    name: address.name || "-",
    surname: address.surname || "-",
    company: address.company || undefined,
    street1: address.street1,
    street2: address.street2 || undefined,
    zip_code: address.zip,
    city: address.city,
    state: address.state || undefined,
    country: address.country?.toUpperCase(),
    phone: address.phone,
    email: address.email,
  };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError" ? "timed out" : error.message;
  }
  return String(error);
}

export function createPacklinkClient(options: PacklinkClientOptions): PacklinkClient {
  const apiKey = cleanSecret(options.apiKey);
  const baseUrl = (options.baseUrl ?? PACKLINK_API_BASE_URL).replace(/\/+$/, "");
  const currency = options.currency ?? "EUR";
  const fallback = options.fallbackDimensionsMm ?? DEFAULT_FALLBACK_DIMENSIONS_MM;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  const fetchInit: RequestInit = options.fetchInit ?? { cache: "no-store" };
  const sender = options.sender;

  async function request<T = unknown>(
    method: HttpMethod,
    path: string,
    { body, timeoutMs }: { body?: unknown; timeoutMs?: number } = {},
  ): Promise<T> {
    if (!apiKey) {
      throw new PacklinkError("Packlink API key is not configured.", { code: "not_configured" });
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const headers = new Headers(fetchInit.headers);
    headers.set("Authorization", apiKey);
    headers.set("Accept", "application/json");
    if (body !== undefined) headers.set("Content-Type", "application/json");

    const label = `Packlink ${method} ${path.split("?")[0]}`;
    let response: Response;
    let responseText: string;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...fetchInit,
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(
          timeoutMs ?? (method === "GET" ? timeouts.read : timeouts.write),
        ),
      });
      responseText = await response.text();
    } catch (cause) {
      throw new PacklinkError(`${label} failed: ${describe(cause)}`, { code: "network", cause });
    }

    if (!response.ok) {
      throw new PacklinkError(
        `${label} responded ${response.status}: ${responseText.slice(0, 300)}`,
        { code: "http", status: response.status, body: responseText.slice(0, 2000) },
      );
    }
    if (!responseText) return undefined as T;
    try {
      return JSON.parse(responseText) as T;
    } catch (cause) {
      throw new PacklinkError(`${label} returned a body that is not JSON.`, {
        code: "invalid_response",
        cause,
      });
    }
  }

  async function listServices(input: ListServicesInput): Promise<PacklinkService[]> {
    const from = input.from ?? (sender?.zip && sender.country ? (sender as PostalLocation) : null);
    if (!from) {
      throw new PacklinkError("Sender zip and country are required to quote a route.", {
        code: "not_configured",
      });
    }
    const origin = location(from, "sender");
    const destination = location(input.to, "destination");
    if (input.parcels.length === 0) throw invalid("At least one parcel is required.");

    const params = new URLSearchParams();
    params.set("from[country]", origin.country);
    params.set("from[zip]", origin.zip);
    params.set("to[country]", destination.country);
    params.set("to[zip]", destination.zip);
    input.parcels.forEach((parcel, index) => {
      const fields = toPacklinkPackage(parcel, fallback);
      params.set(`packages[${index}][weight]`, fields.weight.toFixed(2));
      params.set(`packages[${index}][width]`, String(fields.width));
      params.set(`packages[${index}][height]`, String(fields.height));
      params.set(`packages[${index}][length]`, String(fields.length));
    });
    params.set("sortBy", "totalPrice");

    const raw = await request<unknown>("GET", `/services?${params.toString()}`);
    const disabled = new Set((input.disabledCarriers ?? []).map(normalizeCarrierName));
    const includeDropoff = input.includeDropoff ?? true;

    return (Array.isArray(raw) ? raw : [])
      .map(toService)
      .filter(
        (service): service is PacklinkService =>
          service !== null &&
          (includeDropoff || !service.dropoff) &&
          !disabled.has(normalizeCarrierName(service.carrierName)),
      )
      .sort((a, b) => a.netCents - b.netCents);
  }

  async function listDropoffs(input: ListDropoffsInput): Promise<PacklinkDropoffPoint[]> {
    const serviceId = Math.trunc(Number(input.serviceId));
    if (!Number.isFinite(serviceId) || serviceId <= 0) throw invalid("Invalid service id.");
    const { zip, country } = location(input, "destination");

    const raw = await request<unknown>(
      "GET",
      `/dropoffs/${serviceId}/${encodeURIComponent(country)}/${encodeURIComponent(zip)}`,
    );
    return (Array.isArray(raw) ? raw : [])
      .map(toDropoffPoint)
      .filter((point): point is PacklinkDropoffPoint => point !== null);
  }

  async function createShipment(input: CreateShipmentInput): Promise<PacklinkShipment> {
    if (!Number.isFinite(input.serviceId) || input.serviceId <= 0) {
      throw invalid("Missing Packlink service id.");
    }
    const from = input.from ?? sender;
    const missingFrom = missingAddressFields(from);
    if (missingFrom.length > 0) {
      throw new PacklinkError(`Sender address is incomplete: ${missingFrom.join(", ")}.`, {
        code: "not_configured",
      });
    }
    const missingTo = missingAddressFields(input.to);
    if (missingTo.length > 0) {
      throw invalid(`Recipient address is incomplete: ${missingTo.join(", ")}.`);
    }
    if (input.parcels.length === 0) throw invalid("At least one parcel is required.");
    if (!Number.isFinite(input.contentValueCents) || input.contentValueCents < 0) {
      throw invalid("Invalid declared content value.");
    }

    const payload = {
      service_id: input.serviceId,
      content: input.content,
      contentvalue: Number((input.contentValueCents / 100).toFixed(2)),
      contentValue_currency: currency,
      content_second_hand: input.secondHand ?? false,
      priority: input.priority ?? false,
      shipment_custom_reference: input.customReference || undefined,
      dropoff_point_id: input.dropoffPointId || undefined,
      from: toPayloadAddress(from as PacklinkAddress),
      to: toPayloadAddress(input.to),
      packages: input.parcels.map((parcel) => toPacklinkPackage(parcel, fallback)),
      ...input.extra,
    };

    const created = await request<unknown>("POST", "/shipments", { body: payload });
    const shipment = toShipment(created, "");
    if (!shipment.reference) {
      throw new PacklinkError("Packlink did not return a reference for the new shipment.", {
        code: "invalid_response",
      });
    }
    return shipment;
  }

  async function getShipment(reference: string): Promise<PacklinkShipment> {
    if (!reference.trim()) throw invalid("Missing shipment reference.");
    const raw = await request<unknown>("GET", `/shipments/${encodeURIComponent(reference)}`);
    return toShipment(raw, reference);
  }

  async function cancelShipment(reference: string): Promise<void> {
    if (!reference.trim()) throw invalid("Missing shipment reference.");
    await request("DELETE", `/shipments/${encodeURIComponent(reference)}`);
  }

  return {
    configured: Boolean(apiKey),
    sender,
    listServices,
    listDropoffs,
    createShipment,
    getShipment,
    cancelShipment,
    request,
  };
}
