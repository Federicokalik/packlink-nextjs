const BRAND = Symbol.for("packlink-nextjs.error");

export type PacklinkErrorCode =
  /** The API key or the sender data needed for the call is missing. */
  | "not_configured"
  /** The call was rejected before reaching Packlink (missing zip, empty parcel list…). */
  | "invalid_input"
  /** Packlink answered with a non-2xx status: see `status` and `body`. */
  | "http"
  /** Timeout, DNS failure, connection reset… Packlink may or may not have received the request. */
  | "network"
  /** Packlink answered 2xx with a body that cannot be used. */
  | "invalid_response";

export interface PacklinkErrorOptions {
  code: PacklinkErrorCode;
  status?: number;
  body?: string;
  cause?: unknown;
}

export class PacklinkError extends Error {
  readonly code: PacklinkErrorCode;
  /** HTTP status, only for `code: "http"`. */
  readonly status?: number;
  /** Raw response body (truncated), only for `code: "http"`. */
  readonly body?: string;

  constructor(message: string, options: PacklinkErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "PacklinkError";
    this.code = options.code;
    this.status = options.status;
    this.body = options.body;
    Object.defineProperty(this, BRAND, { value: true });
  }
}

/**
 * Prefer this over `instanceof`: the CommonJS build bundles each entry point
 * on its own, so an error thrown from `packlink-nextjs/next` may come from a
 * different copy of the class than the one imported from `packlink-nextjs`.
 */
export function isPacklinkError(value: unknown): value is PacklinkError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
