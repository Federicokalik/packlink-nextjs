import { describe, expect, it } from "vitest";

import { classifyShipmentStatus } from "../src";

describe("classifyShipmentStatus", () => {
  it.each([
    [null, "pending"],
    ["", "pending"],
    ["READY_TO_PRINT", "pending"],
    ["awaiting pickup", "pending"],
    ["something new", "pending"],
    ["IN_TRANSIT", "shipped"],
    ["Out for delivery", "shipped"],
    ["picked-up", "shipped"],
    ["In consegna", "shipped"],
    ["DELIVERED", "delivered"],
    ["Consegnato", "delivered"],
    ["UNDELIVERED", "terminal"],
    ["Non consegnato", "terminal"],
    ["CANCELLED", "terminal"],
    ["RETURNED_TO_SENDER", "terminal"],
    ["INCIDENCE", "terminal"],
  ] as const)("%s → %s", (status, expected) => {
    expect(classifyShipmentStatus(status)).toBe(expected);
  });
});
