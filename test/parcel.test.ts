import { describe, expect, it } from "vitest";

import { combineDimensions, combineParcel, hasCompleteParcelData, MAX_SIDE_MM } from "../src";

const machine = { quantity: 1, weightGrams: 8000, lengthMm: 450, widthMm: 250, heightMm: 350 };
const yarn = { quantity: 3, weightGrams: 50, lengthMm: 100, widthMm: 80, heightMm: 80 };

describe("combineDimensions", () => {
  it("keeps the largest base and stacks the volume on the height", () => {
    // Base 450 × 250; volume of 10 machines / base = 3500 mm of stacked height.
    expect(combineDimensions([{ ...machine, quantity: 10 }])).toEqual({
      lengthMm: 450,
      widthMm: 250,
      heightMm: 2000, // clamped
    });
    expect(combineDimensions([{ ...machine, quantity: 2 }])).toEqual({
      lengthMm: 450,
      widthMm: 250,
      heightMm: 700,
    });
  });

  it("never goes below the tallest item and ignores lines without size", () => {
    const tall = { quantity: 1, weightGrams: 100, lengthMm: 50, widthMm: 40, heightMm: 300 };
    // Stacked: (3 × 100·80·80 + 50·40·300) / (100·80) = 315 mm, taller than the 300 mm item.
    expect(combineDimensions([yarn, tall])).toEqual({ lengthMm: 100, widthMm: 80, heightMm: 315 });
    expect(combineDimensions([{ ...yarn, quantity: 1 }, tall])).toEqual({
      lengthMm: 100,
      widthMm: 80,
      heightMm: 300,
    });
    expect(combineDimensions([yarn, { quantity: 2, weightGrams: 10 }])).toEqual({
      lengthMm: 100,
      widthMm: 80,
      heightMm: 240,
    });
    expect(combineDimensions([{ quantity: 1, weightGrams: 10 }])).toBeNull();
  });

  it("clamps sides to the courier maximum", () => {
    const pole = { quantity: 1, weightGrams: 1, lengthMm: 5000, widthMm: 10, heightMm: 10 };
    expect(combineDimensions([pole])?.lengthMm).toBe(MAX_SIDE_MM);
  });
});

describe("hasCompleteParcelData / combineParcel", () => {
  it("is complete only when every line has weight and three sides", () => {
    expect(hasCompleteParcelData([machine, yarn])).toBe(true);
    expect(hasCompleteParcelData([machine, { ...yarn, heightMm: null }])).toBe(false);
    expect(hasCompleteParcelData([machine, { ...yarn, weightGrams: 0 }])).toBe(false);
    expect(hasCompleteParcelData([])).toBe(false);
  });

  it("sums the weight by quantity", () => {
    expect(combineParcel([machine, yarn])).toEqual({
      weightGrams: 8150,
      // (450·250·350 + 3 × 100·80·80) / (450·250) = 367.1 → 368
      dimensionsMm: { lengthMm: 450, widthMm: 250, heightMm: 368 },
      complete: true,
    });
  });
});
