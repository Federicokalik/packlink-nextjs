export type {
  CountryCode,
  DimensionsMm,
  DropoffPointView,
  PacklinkAddress,
  PacklinkDropoffPoint,
  PacklinkService,
  PacklinkShipment,
  Parcel,
  PostalLocation,
} from "./types";

export {
  PacklinkError,
  isPacklinkError,
  type PacklinkErrorCode,
  type PacklinkErrorOptions,
} from "./errors";

export {
  DEFAULT_FALLBACK_DIMENSIONS_MM,
  DEFAULT_TIMEOUTS,
  PACKLINK_API_BASE_URL,
  cleanSecret,
  createPacklinkClient,
  normalizeCarrierName,
  type CreateShipmentInput,
  type HttpMethod,
  type ListDropoffsInput,
  type ListServicesInput,
  type PacklinkClient,
  type PacklinkClientOptions,
} from "./client";

export { createPacklinkClientFromEnv, packlinkOptionsFromEnv } from "./env";

export {
  MAX_SIDE_MM,
  combineDimensions,
  combineParcel,
  hasCompleteParcelData,
  totalWeightGrams,
  type CombinedParcel,
  type ParcelLine,
} from "./parcel";

export {
  defaultServiceLabel,
  priceWithVatAndMarkup,
  resolveShippingOptions,
  type ResolveShippingOptionsInput,
  type ShippingOption,
  type ShippingOptionKind,
  type ShippingRules,
} from "./checkout";

export { classifyShipmentStatus, isFinalProgress, type ShipmentProgress } from "./status";

export {
  createMemoryShipmentStore,
  syncShipments,
  type MemoryShipmentStore,
  type ShipmentSyncStore,
  type ShipmentUpdate,
  type SyncShipmentsOptions,
  type SyncShipmentsResult,
  type TrackedShipment,
} from "./sync";
