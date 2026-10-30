import { vi } from "vitest";

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}

/** A `fetch` that answers from a queue of responses and records every call. */
export function mockFetch(...responses: Array<Response | Error | (() => Response)>) {
  const calls: RecordedCall[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const SENDER = {
  name: "Shop",
  company: "Shop Srl",
  street1: "Via Roma 1",
  city: "Frosinone",
  zip: "03100",
  country: "IT",
  phone: "+390775000000",
  email: "shop@example.com",
};
