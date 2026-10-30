import { createPacklinkClient, type PacklinkClient, type PacklinkClientOptions } from "./client";
import type { PacklinkAddress } from "./types";

type Env = Record<string, string | undefined>;

function processEnv(): Env {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Client options from environment variables:
 *
 * - `PACKLINK_API_KEY` (required), `PACKLINK_API_BASE_URL`, `PACKLINK_CURRENCY`
 * - `PACKLINK_FROM_NAME`, `_SURNAME`, `_COMPANY`, `_STREET`, `_STREET2`,
 *   `_CITY`, `_ZIP`, `_STATE`, `_COUNTRY`, `_PHONE`, `_EMAIL`
 *
 * `overrides` win over the environment; `overrides.sender` is merged field by field.
 */
export function packlinkOptionsFromEnv(
  env: Env = processEnv(),
  overrides: Partial<PacklinkClientOptions> = {},
): PacklinkClientOptions {
  const sender: PacklinkAddress = {
    name: read(env, "PACKLINK_FROM_NAME"),
    surname: read(env, "PACKLINK_FROM_SURNAME"),
    company: read(env, "PACKLINK_FROM_COMPANY"),
    street1: read(env, "PACKLINK_FROM_STREET"),
    street2: read(env, "PACKLINK_FROM_STREET2"),
    city: read(env, "PACKLINK_FROM_CITY"),
    zip: read(env, "PACKLINK_FROM_ZIP"),
    state: read(env, "PACKLINK_FROM_STATE"),
    country: read(env, "PACKLINK_FROM_COUNTRY"),
    phone: read(env, "PACKLINK_FROM_PHONE"),
    email: read(env, "PACKLINK_FROM_EMAIL"),
  };
  return {
    apiKey: read(env, "PACKLINK_API_KEY"),
    baseUrl: read(env, "PACKLINK_API_BASE_URL"),
    currency: read(env, "PACKLINK_CURRENCY"),
    ...overrides,
    sender: { ...sender, ...overrides.sender },
  };
}

export function createPacklinkClientFromEnv(
  env?: Env,
  overrides?: Partial<PacklinkClientOptions>,
): PacklinkClient {
  return createPacklinkClient(packlinkOptionsFromEnv(env, overrides));
}
