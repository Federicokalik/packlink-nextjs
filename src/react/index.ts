import { useCallback, useEffect, useMemo, useState } from "react";

import type { DropoffPointView } from "../types";

export type { DropoffPointView } from "../types";

export interface UseDropoffPointsOptions {
  /** `packlinkServiceId` of the selected option; nothing is loaded without it. */
  serviceId: number | null | undefined;
  zip: string | null | undefined;
  country: string | null | undefined;
  /** Route created with `createDropoffsRoute`. Default `/api/packlink/dropoffs`. */
  endpoint?: string;
  /** E.g. `option.requiresDropoff`. Default `true`. */
  enabled?: boolean;
}

export interface UseDropoffPointsResult {
  points: DropoffPointView[];
  loading: boolean;
  error: Error | null;
  selectedId: string | null;
  selected: DropoffPointView | null;
  select: (id: string | null) => void;
}

/**
 * Pickup points for the selected service and destination. The selection is
 * kept across reloads only while the point is still in the list, so a stale
 * id can never reach the order.
 */
export function useDropoffPoints({
  serviceId,
  zip,
  country,
  endpoint = "/api/packlink/dropoffs",
  enabled = true,
}: UseDropoffPointsOptions): UseDropoffPointsResult {
  const [points, setPoints] = useState<DropoffPointView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cleanZip = zip?.trim() ?? "";
  const cleanCountry = country?.trim().toUpperCase() ?? "";
  const active = enabled && Boolean(serviceId && serviceId > 0 && cleanZip && cleanCountry);

  useEffect(() => {
    if (!active) {
      setPoints([]);
      setSelectedId(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({
      serviceId: String(serviceId),
      zip: cleanZip,
      country: cleanCountry,
    });
    setLoading(true);
    setError(null);

    fetch(`${endpoint}?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          points?: DropoffPointView[];
        } | null;
        if (!response.ok) throw new Error(`Pickup points request failed (${response.status}).`);
        return data?.points ?? [];
      })
      .then((next) => {
        setPoints(next);
        setSelectedId((current) => (next.some((point) => point.id === current) ? current : null));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setPoints([]);
        setSelectedId(null);
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [active, serviceId, cleanZip, cleanCountry, endpoint]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);
  const selected = useMemo(
    () => points.find((point) => point.id === selectedId) ?? null,
    [points, selectedId],
  );

  return { points, loading, error, selectedId, selected, select };
}
