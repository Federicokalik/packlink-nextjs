import { createShippingOptionsRoute } from "packlink-nextjs/next";

import { loadCart } from "@/lib/cart";
import { packlink, shippingRules, storePickup } from "@/lib/packlink";

export const dynamic = "force-dynamic";

// POST { items: [{ productId, quantity }], zip, country } → { options, subtotalCents }
export const { POST } = createShippingOptionsRoute({
  client: packlink,
  resolveCart: loadCart,
  rules: shippingRules,
  extraOptions: [storePickup],
});
