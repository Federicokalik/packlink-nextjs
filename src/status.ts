/**
 * Where a parcel is, reduced to what an order cares about.
 *
 * - `pending`: label created, not yet in the carrier's hands (or unknown)
 * - `shipped`: picked up, in transit, out for delivery
 * - `delivered`: done
 * - `terminal`: will not be delivered as-is (cancelled, returned, lost, incident)
 */
export type ShipmentProgress = "pending" | "shipped" | "delivered" | "terminal";

/**
 * Packlink reports the carrier state as free text. Only unambiguous signals
 * move a shipment forward; anything unknown stays `pending`, so a new or
 * unexpected value can never trigger a wrong transition (the raw text is
 * still saved and visible). Italian carrier wording is matched too.
 */
export function classifyShipmentStatus(status: string | null | undefined): ShipmentProgress {
  const value = (status ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!value) return "pending";
  // Negations first: "UNDELIVERED" contains "DELIVERED".
  if (/(UNDELIVER|NOT_DELIVER|NON_CONSEGNAT|MANCATA_CONSEGNA)/.test(value)) return "terminal";
  if (/(DELIVERED|CONSEGNAT)/.test(value)) return "delivered";
  if (/(CANCEL|ANNUL|RETURNED|RETURN_|FAILED|INCIDEN|LOST)/.test(value)) return "terminal";
  // "AWAITING_PICKUP" is still in the shop: waiting markers beat "PICKUP".
  if (/(AWAITING|WAITING|READY_TO|READY_FOR|PENDING|IN_ATTESA)/.test(value)) return "pending";
  if (
    /(IN_TRANSIT|INTRANSIT|OUT_FOR_DELIVERY|PICKED_UP|PICKUP|COLLECTED|SHIPPED|IN_CONSEGNA)/.test(
      value,
    )
  ) {
    return "shipped";
  }
  return "pending";
}

/** Delivered or terminal: polling it again cannot change anything. */
export function isFinalProgress(progress: ShipmentProgress): boolean {
  return progress === "delivered" || progress === "terminal";
}
