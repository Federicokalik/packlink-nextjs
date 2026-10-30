// Route handler factories for the Next.js App Router.
//
// They only use the standard `Request` / `Response`, so they also work in any
// Fetch-API runtime (Remix, Hono, SvelteKit endpoints…). Segment config such
// as `export const dynamic = "force-dynamic"` must stay in your route file:
// Next.js reads it statically.

import { resolveShippingOptions, type ShippingOption, type ShippingRules } from "../checkout";
import { cleanSecret, type PacklinkClient } from "../client";
import { isPacklinkError } from "../errors";
import { combineParcel, type ParcelLine } from "../parcel";
import type { DropoffPointView, PacklinkDropoffPoint, PostalLocation } from "../types";

type Handler = (request: Request) => Promise<Response>;

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Constant-time comparison, without `node:crypto`, so it runs on every runtime. */
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/** `Authorization: Bearer <secret>`, the header Vercel Cron sends with `CRON_SECRET`. */
export function isAuthorizedCronRequest(
  request: Request,
  secret: string | null | undefined,
): boolean {
  const expected = cleanSecret(secret);
  if (!expected) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return safeEqual(provided, expected);
}

export interface SyncRouteOptions {
  /** Shared with the scheduler. Without it every call gets 503: the job is never open. */
  secret: string | null | undefined;
  /** Usually `() => syncShipments({ client, store, onTransition })`. */
  run: (request: Request) => Promise<unknown>;
}

/**
 * Protected endpoint for the scheduler. Both methods do the same thing:
 * Vercel Cron calls with GET, the other templates in `cron/` use POST.
 *
 * ```ts
 * export const dynamic = "force-dynamic";
 * export const { GET, POST } = createSyncRoute({ secret, run });
 * ```
 */
export function createSyncRoute(options: SyncRouteOptions): { GET: Handler; POST: Handler } {
  const handler: Handler = async (request) => {
    if (!cleanSecret(options.secret)) {
      console.error("[packlink-sync] cron secret is not configured.");
      return json({ error: "job_not_configured" }, 503);
    }
    if (!isAuthorizedCronRequest(request, options.secret)) {
      return json({ error: "unauthorized" }, 401);
    }
    try {
      return json((await options.run(request)) ?? { ok: true });
    } catch (error) {
      console.error("[packlink-sync] run failed.", error);
      return json({ error: isPacklinkError(error) ? error.message : "sync_failed" }, 500);
    }
  };
  return { GET: handler, POST: handler };
}

export function toDropoffView(point: PacklinkDropoffPoint): DropoffPointView {
  const { raw: _raw, ...view } = point;
  return view;
}

export interface DropoffsRouteOptions {
  client: Pick<PacklinkClient, "listDropoffs">;
  onError?: (error: unknown) => void;
}

/**
 * `GET ?serviceId=123&zip=03100&country=IT` → `{ points: DropoffPointView[] }`.
 * Answers 400 on invalid input and 502 (with `points: []`) when Packlink fails.
 */
export function createDropoffsRoute(options: DropoffsRouteOptions): { GET: Handler } {
  return {
    GET: async (request) => {
      const params = new URL(request.url).searchParams;
      const serviceId = Math.trunc(Number(params.get("serviceId")));
      const zip = (params.get("zip") ?? "").trim();
      const country = (params.get("country") ?? "").trim().toUpperCase();
      if (!(serviceId > 0) || !zip || zip.length > 16 || !/^[A-Z]{2}$/.test(country)) {
        return json({ error: "invalid_destination", points: [] }, 400);
      }
      try {
        const points = await options.client.listDropoffs({ serviceId, zip, country });
        return json({ points: points.map(toDropoffView) });
      } catch (error) {
        (options.onError ?? ((e) => console.warn("[packlink] pickup points unavailable.", e)))(
          error,
        );
        return json({ error: "packlink_unavailable", points: [] }, 502);
      }
    },
  };
}

/** Cart data read from YOUR catalog: never trust prices or weights sent by the browser. */
export interface ResolvedCart {
  subtotalCents: number;
  lines: ParcelLine[];
  /** Overrides `zip` / `country` from the request body. */
  destination?: Partial<PostalLocation>;
}

type MaybePromise<T> = T | Promise<T>;

export interface ShippingOptionsRouteOptions<TCart extends ResolvedCart = ResolvedCart> {
  client: Pick<PacklinkClient, "configured" | "listServices">;
  /**
   * Turn the request body (e.g. `{ items: [{ productId, quantity }] }`) into
   * trusted cart data. Return `null` for an empty or invalid cart.
   */
  resolveCart: (body: unknown, request: Request) => MaybePromise<TCart | null>;
  rules: ShippingRules | ((cart: TCart) => MaybePromise<ShippingRules>);
  /** E.g. in-store pickup. */
  extraOptions?: ShippingOption[] | ((cart: TCart) => MaybePromise<ShippingOption[]>);
  onError?: (error: unknown) => void;
}

/**
 * `POST { ...yourCartFields, zip, country }` → `{ options, subtotalCents }`.
 *
 * Call `resolveShippingOptions` again when the order is placed and look the
 * chosen id up in the fresh list: the amount shown here is only a preview.
 */
export function createShippingOptionsRoute<TCart extends ResolvedCart = ResolvedCart>(
  options: ShippingOptionsRouteOptions<TCart>,
): { POST: Handler } {
  return {
    POST: async (request) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_body" }, 400);
      }

      const cart = await options.resolveCart(body, request);
      if (!cart || cart.lines.length === 0) return json({ error: "invalid_cart" }, 400);

      const fields = (body ?? {}) as Record<string, unknown>;
      const destination = {
        zip: typeof fields.zip === "string" ? fields.zip.trim() : undefined,
        country:
          typeof fields.country === "string" ? fields.country.trim().toUpperCase() : undefined,
        ...cart.destination,
      };
      const rules = typeof options.rules === "function" ? await options.rules(cart) : options.rules;
      const extraOptions =
        typeof options.extraOptions === "function"
          ? await options.extraOptions(cart)
          : options.extraOptions;

      const shippingOptions = await resolveShippingOptions(options.client, {
        destination,
        parcel: combineParcel(cart.lines),
        subtotalCents: cart.subtotalCents,
        rules,
        extraOptions,
        onError: options.onError,
      });
      return json({ options: shippingOptions, subtotalCents: cart.subtotalCents });
    },
  };
}
