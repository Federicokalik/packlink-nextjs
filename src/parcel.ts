import type { DimensionsMm, Parcel } from "./types";

/** One cart line for parcel purposes: the product's own size × quantity. */
export interface ParcelLine {
  quantity: number;
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
}

/** A cart folded into one parcel, plus whether every line had real data. */
export interface CombinedParcel extends Parcel {
  dimensionsMm: DimensionsMm | null;
  /** True only when every line has weight and all three sides. */
  complete: boolean;
}

/** Beyond this a side is no longer a courier parcel: it gets clamped. */
export const MAX_SIDE_MM = 2000;

function units(quantity: number): number {
  return Math.max(0, Math.trunc(Number(quantity) || 0));
}

function positive(value: number | null | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * A live quote is only trustworthy when every ordered article has weight and
 * dimensions: one product without data makes the parcel smaller than it is,
 * and the difference is paid by the shop when the courier measures it.
 */
export function hasCompleteParcelData(lines: ParcelLine[]): boolean {
  return (
    lines.length > 0 &&
    lines.every(
      (line) =>
        units(line.quantity) > 0 &&
        positive(line.weightGrams) > 0 &&
        positive(line.lengthMm) > 0 &&
        positive(line.widthMm) > 0 &&
        positive(line.heightMm) > 0,
    )
  );
}

export function totalWeightGrams(lines: ParcelLine[]): number {
  return lines.reduce((sum, line) => sum + positive(line.weightGrams) * units(line.quantity), 0);
}

/**
 * Size of a whole cart packed in a single box.
 *
 * Neither the sum nor the maximum of each side describes a real box on its
 * own: summing sides gives a metres-long box for three balls of yarn, taking
 * the maximum ignores that ten sewing machines do not fit in the space of
 * one. The model is the one used when packing by hand:
 *
 *  - the base (length × width) is the largest side of any item, because the
 *    box must at least contain the biggest piece;
 *  - the height is what it takes to fit everything — total volume divided by
 *    the base — and never less than the tallest item: things get stacked.
 *
 * It rounds up, which is the right side to be wrong on: a quote slightly too
 * high is absorbed by the markup, one too low is paid by the shop at pickup.
 * Lines without dimensions do not contribute; they stay covered by the
 * client's fallback box.
 */
export function combineDimensions(lines: ParcelLine[]): DimensionsMm | null {
  let maxLength = 0;
  let maxWidth = 0;
  let maxHeight = 0;
  let volumeMm3 = 0;

  for (const line of lines) {
    const quantity = units(line.quantity);
    const length = positive(line.lengthMm);
    const width = positive(line.widthMm);
    const height = positive(line.heightMm);
    if (quantity === 0 || length === 0 || width === 0 || height === 0) continue;
    maxLength = Math.max(maxLength, length);
    maxWidth = Math.max(maxWidth, width);
    maxHeight = Math.max(maxHeight, height);
    volumeMm3 += length * width * height * quantity;
  }

  if (maxLength === 0 || maxWidth === 0 || maxHeight === 0) return null;

  const stackedHeight = Math.ceil(volumeMm3 / (maxLength * maxWidth));
  const clamp = (value: number) => Math.min(MAX_SIDE_MM, Math.max(1, Math.round(value)));
  return {
    lengthMm: clamp(maxLength),
    widthMm: clamp(maxWidth),
    heightMm: clamp(Math.max(maxHeight, stackedHeight)),
  };
}

/** Weight, size and completeness of a cart in one call. */
export function combineParcel(lines: ParcelLine[]): CombinedParcel {
  return {
    weightGrams: totalWeightGrams(lines),
    dimensionsMm: combineDimensions(lines),
    complete: hasCompleteParcelData(lines),
  };
}

/** Packlink package fields: kilograms with two decimals, whole centimetres. */
export interface PacklinkPackageFields {
  weight: number;
  width: number;
  height: number;
  length: number;
}

/** Packlink rejects zeroes: every side is at least 1 cm, the weight at least 100 g. */
export function toPacklinkPackage(parcel: Parcel, fallback: DimensionsMm): PacklinkPackageFields {
  const toCm = (valueMm: number | null | undefined, fallbackMm: number) => {
    const mm = positive(valueMm) || fallbackMm;
    return Math.max(1, Math.round(mm / 10));
  };
  const size = parcel.dimensionsMm;
  return {
    weight: Number(Math.max(0.1, positive(parcel.weightGrams) / 1000).toFixed(2)),
    width: toCm(size?.widthMm, fallback.widthMm),
    height: toCm(size?.heightMm, fallback.heightMm),
    length: toCm(size?.lengthMm, fallback.lengthMm),
  };
}
