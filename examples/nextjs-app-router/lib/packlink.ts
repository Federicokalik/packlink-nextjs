import "server-only";

import {
  createPacklinkClientFromEnv,
  type ShippingOption,
  type ShippingRules,
} from "packlink-nextjs";

/** Reads PACKLINK_API_KEY and PACKLINK_FROM_* (see .env.example). */
export const packlink = createPacklinkClientFromEnv();

/** Could come from your database and an admin page instead. */
export const shippingRules: ShippingRules = {
  flatRateCents: 990,
  flatLabel: "Express courier",
  freeThresholdCents: 7900,
  vatPct: 22,
  markupPct: 10,
  disabledCarriers: [],
};

export const storePickup: ShippingOption = {
  id: "pickup",
  label: "In-store pickup",
  amountCents: 0,
  kind: "custom",
};
