import "server-only";

import {
  combineParcel,
  isPacklinkError,
  type PacklinkAddress,
  type PacklinkShipment,
} from "packlink-nextjs";

import { db } from "./db";
import { packlink } from "./packlink";

/**
 * Buys the label for an order.
 *
 * Creating the same shipment twice is paid twice, and Packlink accepts the
 * duplicate. So the order is claimed in the database BEFORE calling Packlink:
 * a double click or two admins on the same order cannot both get through.
 */
export async function createShipmentForOrder(orderId: number): Promise<PacklinkShipment> {
  const order = (await db.execute({ sql: `SELECT * FROM orders WHERE id = ?`, args: [orderId] }))
    .rows[0];
  if (!order) throw new Error("Order not found.");
  if (order.packlink_reference) {
    throw new Error(`This order already has shipment ${String(order.packlink_reference)}.`);
  }

  const { rows: lines } = await db.execute({
    sql: `SELECT l.title, l.quantity, p.weight_grams, p.length_mm, p.width_mm, p.height_mm
          FROM order_lines l LEFT JOIN products p ON p.id = l.product_id
          WHERE l.order_id = ?`,
    args: [orderId],
  });
  const parcel = combineParcel(
    lines.map((line) => ({
      quantity: Number(line.quantity),
      weightGrams: line.weight_grams === null ? null : Number(line.weight_grams),
      lengthMm: line.length_mm === null ? null : Number(line.length_mm),
      widthMm: line.width_mm === null ? null : Number(line.width_mm),
      heightMm: line.height_mm === null ? null : Number(line.height_mm),
    })),
  );

  const text = (value: unknown) =>
    value === null || value === undefined ? undefined : String(value);
  const to: PacklinkAddress = {
    name: text(order.ship_first_name),
    surname: text(order.ship_last_name),
    company: text(order.ship_company),
    street1: text(order.ship_street1),
    street2: text(order.ship_street2),
    city: text(order.ship_city),
    zip: text(order.ship_zip),
    state: text(order.ship_state),
    country: text(order.ship_country),
    phone: text(order.ship_phone),
    email: text(order.email),
  };
  if (!to.zip || !to.country) throw new Error("The order has no destination zip code.");

  // Quote again now: the price the shop pays is today's, and the service the
  // customer chose must still exist on this route. The customer's own price
  // was fixed at checkout and does not change.
  const chosenServiceId = Number(order.packlink_service_id) || null;
  const dropoffPointId = text(order.packlink_dropoff_point_id) ?? null;
  const services = await packlink.listServices({
    to: { zip: to.zip, country: to.country },
    parcels: [parcel],
    includeDropoffPoint: Boolean(dropoffPointId),
  });
  const service = chosenServiceId
    ? services.find((candidate) => candidate.serviceId === chosenServiceId)
    : services.find((candidate) => !candidate.requiresDropoffPoint);
  if (!service) {
    throw new Error(
      chosenServiceId
        ? "The service chosen by the customer is no longer available for this destination."
        : "Packlink has no service for this destination and parcel.",
    );
  }

  const claim = await db.execute({
    sql: `UPDATE orders SET packlink_reference = 'pending:' || id
          WHERE id = ? AND packlink_reference IS NULL`,
    args: [orderId],
  });
  if (claim.rowsAffected === 0) throw new Error("A shipment is already being created.");

  let shipment: PacklinkShipment;
  try {
    const totalItems = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
    shipment = await packlink.createShipment({
      serviceId: service.serviceId,
      to,
      parcels: [parcel],
      content:
        lines.length === 1
          ? `${Number(lines[0]!.quantity)} ${String(lines[0]!.title)}`.slice(0, 80)
          : `${totalItems} items`,
      // The declared value is the goods, not what the customer paid in total.
      contentValueCents: Number(order.subtotal_cents),
      customReference: String(order.number),
      dropoffPointId,
    });
  } catch (error) {
    // A clear refusal (HTTP 4xx/5xx) means nothing was created: release the claim.
    // After a timeout nobody knows: keep "pending:<id>" and check the Packlink panel.
    if (isPacklinkError(error) && error.code !== "network") {
      await db.execute({
        sql: `UPDATE orders SET packlink_reference = NULL
              WHERE id = ? AND packlink_reference = 'pending:' || id`,
        args: [orderId],
      });
    }
    throw error;
  }

  await db.execute({
    sql: `UPDATE orders SET packlink_reference = ?, packlink_status = ?, packlink_label_url = ?,
            tracking_number = COALESCE(?, tracking_number), tracking_url = COALESCE(?, tracking_url)
          WHERE id = ?`,
    args: [
      shipment.reference,
      shipment.status,
      shipment.labelUrl,
      shipment.trackingNumber,
      shipment.trackingUrl,
      orderId,
    ],
  });
  return shipment;
}

/**
 * Cancels on Packlink first, then frees the order. Clearing the reference
 * after a failed cancellation would leave a live, paid shipment that the
 * admin believes does not exist — and is ready to create again.
 */
export async function cancelShipmentForOrder(orderId: number): Promise<void> {
  const order = (
    await db.execute({ sql: `SELECT packlink_reference FROM orders WHERE id = ?`, args: [orderId] })
  ).rows[0];
  const reference = order?.packlink_reference ? String(order.packlink_reference) : null;
  if (!reference || reference.startsWith("pending:")) {
    throw new Error("This order has no Packlink shipment to cancel.");
  }

  await packlink.cancelShipment(reference);
  await db.execute({
    sql: `UPDATE orders SET packlink_reference = NULL, packlink_status = NULL,
            packlink_label_url = NULL, packlink_final_at = NULL
          WHERE id = ? AND packlink_reference = ?`,
    args: [orderId, reference],
  });
}
