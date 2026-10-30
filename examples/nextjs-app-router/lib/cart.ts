import "server-only";

import type { ResolvedCart } from "packlink-nextjs/next";

import { db } from "./db";

/**
 * The browser sends only `{ items: [{ productId, quantity }] }`: prices,
 * weights and sizes are read here, from the catalog, every time.
 */
export async function loadCart(body: unknown): Promise<ResolvedCart | null> {
  const rawItems = (body as { items?: unknown })?.items;
  if (!Array.isArray(rawItems)) return null;

  const quantities = new Map<number, number>();
  for (const item of rawItems as Array<{ productId?: unknown; quantity?: unknown }>) {
    const productId = Math.trunc(Number(item?.productId));
    const quantity = Math.trunc(Number(item?.quantity));
    if (productId > 0 && quantity > 0 && quantity <= 999) {
      quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
    }
  }
  if (quantities.size === 0) return null;

  const ids = [...quantities.keys()];
  const { rows } = await db.execute({
    sql: `SELECT id, price_cents, weight_grams, length_mm, width_mm, height_mm
          FROM products WHERE id IN (${ids.map(() => "?").join(", ")})`,
    args: ids,
  });

  let subtotalCents = 0;
  const lines = rows.map((row) => {
    const quantity = quantities.get(Number(row.id)) ?? 0;
    subtotalCents += Number(row.price_cents) * quantity;
    return {
      quantity,
      weightGrams: row.weight_grams === null ? null : Number(row.weight_grams),
      lengthMm: row.length_mm === null ? null : Number(row.length_mm),
      widthMm: row.width_mm === null ? null : Number(row.width_mm),
      heightMm: row.height_mm === null ? null : Number(row.height_mm),
    };
  });
  return lines.length > 0 ? { subtotalCents, lines } : null;
}
