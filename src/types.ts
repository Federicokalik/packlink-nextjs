// Public shapes shared by the client, the checkout helpers and the UI.
//
// Units are explicit in every field name and never change: weights in grams,
// sizes in millimetres, money in integer cents. The client converts to what
// Packlink expects (kg, cm, decimal euros) at the very last moment.

/** ISO 3166-1 alpha-2 country code, e.g. "IT", "ES", "FR". */
export type CountryCode = string;

/** A zip code in a country: what Packlink needs to quote a route. */
export interface PostalLocation {
  zip: string;
  country: CountryCode;
}

/** Outer size of a parcel. */
export interface DimensionsMm {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

/** One parcel. Without dimensions the client falls back to a 20 × 20 × 20 cm box. */
export interface Parcel {
  weightGrams: number;
  dimensionsMm?: DimensionsMm | null;
}

/** Sender or recipient of a shipment (`from` / `to` in the Packlink payload). */
export interface PacklinkAddress {
  name?: string;
  surname?: string;
  company?: string;
  street1?: string;
  street2?: string;
  city?: string;
  zip?: string;
  state?: string;
  country?: CountryCode;
  phone?: string;
  email?: string;
}

/** A carrier service that can move the parcel on the requested route. */
export interface PacklinkService {
  serviceId: number;
  serviceName: string;
  carrierName: string;
  /** Packlink `base_price`: what you pay, VAT excluded, in cents. */
  netCents: number;
  transitTime: string | null;
  /**
   * Delivered to a pickup point the customer chooses (`delivery_to_parcelshop`):
   * it cannot be sold as home delivery, and the shipment needs a `dropoffPointId`.
   */
  requiresDropoffPoint: boolean;
  /** You hand the parcel in at a drop-off point instead of a collection (`dropoff`). */
  senderDropoff: boolean;
  raw: Record<string, unknown>;
}

export interface PacklinkDropoffPoint {
  id: string;
  name: string;
  address: string;
  city: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  openingHours: Record<string, string> | null;
  raw: Record<string, unknown>;
}

/** What the browser receives: the documented fields, without the raw payload. */
export type DropoffPointView = Omit<PacklinkDropoffPoint, "raw">;

export interface PacklinkShipment {
  reference: string;
  /** Packlink state as returned by the API (free text); see `classifyShipmentStatus`. */
  status: string | null;
  /** First of `trackingNumbers`: one per parcel. */
  trackingNumber: string | null;
  trackingNumbers: string[];
  trackingUrl: string | null;
  /**
   * The shipment payload has no labels: they come from a separate endpoint and
   * exist only once the shipment is paid. Filled by `getShipment(ref, { includeLabels: true })`.
   */
  labelUrl: string | null;
  raw: Record<string, unknown>;
}

/** A zip code known to Packlink, with the place it belongs to. */
export interface PacklinkPostalCode {
  id: string;
  zip: string;
  city: string;
  /** Province / county, when Packlink returns it (exact lookups only). */
  province: string | null;
  /** Region or state as Packlink names it. */
  state: string | null;
  countryCode: CountryCode | null;
  /** Ready-made text such as "03100 - Frosinone". */
  label: string;
  latitude: number | null;
  longitude: number | null;
  raw: Record<string, unknown>;
}

export type PostalCodeView = Omit<PacklinkPostalCode, "raw">;

/** A delivery area of a country (e.g. mainland vs islands), used to scope postal code searches. */
export interface PacklinkPostalZone {
  id: string;
  name: string;
  countryCode: CountryCode;
  hasPostalCodes: boolean;
  phonePrefix: string | null;
  raw: Record<string, unknown>;
}
