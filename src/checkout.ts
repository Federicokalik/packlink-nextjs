// Shipping options for a checkout.
//
// The order of precedence is: free shipping above the threshold, then live
// Packlink quotes (net + VAT + markup), then the flat rate. Packlink being
// slow, down or without services for the route never breaks the checkout: it
// only means the customer sees the flat rate.

import type { PacklinkClient } from "./client";
import type { Parcel, PacklinkService, PostalLocation } from "./types";

export type ShippingOptionKind = "packlink" | "flat" | "free" | "custom";

export interface ShippingOption {
  /**
   * Stable id to store with the order. Home delivery keeps the id `"flat"`
   * whether it is free or paid, so the customer's choice survives the
   * re-quote done when the order is placed.
   */
  id: string;
  label: string;
  /** Gross amount the customer pays, in cents. */
  amountCents: number;
  kind: ShippingOptionKind;
  packlinkServiceId?: number;
  /** The customer must choose a pickup point before paying (`useDropoffPoints`). */
  requiresDropoffPoint?: boolean;
  carrierName?: string;
  serviceName?: string;
  transitTime?: string | null;
}

export interface ShippingRules {
  /** Home delivery price when live quotes are off or unavailable, in cents. */
  flatRateCents: number;
  flatLabel?: string;
  /** Subtotal (cents) from which home delivery is free. `null` = never free. */
  freeThresholdCents?: number | null;
  freeLabel?: string;
  /** VAT added to Packlink net prices, in percent (e.g. 22). Default 0. */
  vatPct?: number;
  /** Your margin on top of the VAT-inclusive price, in percent. Default 0. */
  markupPct?: number;
  /** Use Packlink live quotes. Default `true`. */
  liveQuotes?: boolean;
  disabledCarriers?: string[];
  /** Offer services delivered to a pickup point the customer chooses. Default `true`. */
  includeDropoffPoint?: boolean;
  /** Label of a Packlink option. Default "Carrier — Service". */
  formatLabel?: (service: PacklinkService) => string;
}

export interface ResolveShippingOptionsInput {
  destination: Partial<PostalLocation>;
  /**
   * The parcel, typically from `combineParcel`. With `complete: false` live
   * quotes are skipped: they would be computed on a parcel smaller than the real one.
   */
  parcel: Parcel & { complete?: boolean };
  /** Goods subtotal the free-shipping threshold is checked against, in cents. */
  subtotalCents: number;
  rules: ShippingRules;
  /** Always appended, e.g. in-store pickup. */
  extraOptions?: ShippingOption[];
  /** Called when the live quote fails. Default: `console.warn`. */
  onError?: (error: unknown) => void;
}

/** Packlink net price → what the customer pays. */
export function priceWithVatAndMarkup(
  netCents: number,
  { vatPct = 0, markupPct = 0 }: { vatPct?: number; markupPct?: number } = {},
): number {
  return Math.round(netCents * (1 + vatPct / 100) * (1 + markupPct / 100));
}

export function defaultServiceLabel(service: PacklinkService): string {
  return [service.carrierName, service.serviceName].filter(Boolean).join(" — ") || "Courier";
}

export async function resolveShippingOptions(
  client: Pick<PacklinkClient, "configured" | "listServices">,
  input: ResolveShippingOptionsInput,
): Promise<ShippingOption[]> {
  const { rules, destination, parcel } = input;
  const extra = input.extraOptions ?? [];
  const flatLabel = rules.flatLabel ?? "Standard shipping";

  const free =
    rules.freeThresholdCents !== null &&
    rules.freeThresholdCents !== undefined &&
    input.subtotalCents >= rules.freeThresholdCents;
  if (free) {
    return [
      { id: "flat", label: rules.freeLabel ?? flatLabel, amountCents: 0, kind: "free" },
      ...extra,
    ];
  }

  const canQuote =
    rules.liveQuotes !== false &&
    client.configured &&
    parcel.complete !== false &&
    Boolean(destination.zip?.trim()) &&
    Boolean(destination.country?.trim());

  if (canQuote) {
    try {
      const services = await client.listServices({
        to: { zip: destination.zip!, country: destination.country! },
        parcels: [parcel],
        disabledCarriers: rules.disabledCarriers,
        includeDropoffPoint: rules.includeDropoffPoint ?? true,
      });
      if (services.length > 0) {
        const formatLabel = rules.formatLabel ?? defaultServiceLabel;
        return [
          ...services.map((service): ShippingOption => ({
            id: `packlink-${service.serviceId}`,
            label: formatLabel(service),
            amountCents: priceWithVatAndMarkup(service.netCents, rules),
            kind: "packlink",
            packlinkServiceId: service.serviceId,
            requiresDropoffPoint: service.requiresDropoffPoint,
            carrierName: service.carrierName,
            serviceName: service.serviceName,
            transitTime: service.transitTime,
          })),
          ...extra,
        ];
      }
    } catch (error) {
      (
        input.onError ??
        ((e) => console.warn("[packlink] live quote failed, using the flat rate.", e))
      )(error);
    }
  }

  return [
    { id: "flat", label: flatLabel, amountCents: rules.flatRateCents, kind: "flat" },
    ...extra,
  ];
}
