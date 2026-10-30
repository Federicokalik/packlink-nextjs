import { useEffect, useRef, type CSSProperties } from "react";
import type * as Leaflet from "leaflet";

import type { DropoffPointView } from "../types";

export interface DropoffPointMapProps {
  points: DropoffPointView[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  /** The map needs a height: 16rem unless you pass a `className` or `style.height`. */
  style?: CSSProperties;
  tileUrl?: string;
  attribution?: string;
  maxZoom?: number;
  ariaLabel?: string;
  /** Custom marker, e.g. when your bundler does not resolve Leaflet's default icon. */
  icon?: Leaflet.Icon | Leaflet.DivIcon;
}

function popupContent(point: DropoffPointView): HTMLElement {
  // Built with DOM nodes, not an HTML string: names and addresses come from a
  // third-party API and must never be interpreted as markup.
  const root = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = point.name || point.address;
  root.append(
    name,
    document.createElement("br"),
    point.address,
    document.createElement("br"),
    `${point.zip} ${point.city}`.trim(),
  );
  return root;
}

/**
 * Leaflet + OpenStreetMap map of the pickup points. Renders nothing when no
 * point has coordinates. Import `leaflet/dist/leaflet.css` once in your app.
 *
 * Safe to server-render: Leaflet touches `window`, so it is only imported
 * inside an effect, in the browser.
 */
export function DropoffPointMap({
  points,
  selectedId = null,
  onSelect,
  className,
  style,
  tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution = "&copy; OpenStreetMap contributors",
  maxZoom = 19,
  ariaLabel = "Map of the available pickup points",
  icon,
}: DropoffPointMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  // Kept in a ref so that a new callback identity does not rebuild the map.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const mappable = points.filter((point) => point.latitude !== null && point.longitude !== null);

  useEffect(() => {
    if (!container.current || mappable.length === 0) return;
    let map: Leaflet.Map | null = null;
    let cancelled = false;

    void import("leaflet").then((module) => {
      const L = ((module as { default?: typeof Leaflet }).default ?? module) as typeof Leaflet;
      if (cancelled || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false });
      L.tileLayer(tileUrl, { maxZoom, attribution }).addTo(map);

      const bounds = L.latLngBounds([]);
      markers.current.clear();
      for (const point of mappable) {
        const position: [number, number] = [point.latitude!, point.longitude!];
        bounds.extend(position);
        const marker = L.marker(position, { title: point.name, ...(icon ? { icon } : {}) })
          .addTo(map)
          .bindPopup(popupContent(point))
          .on("click", () => onSelectRef.current?.(point.id));
        markers.current.set(point.id, marker);
      }
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
      if (selectedRef.current) markers.current.get(selectedRef.current)?.openPopup();
    });

    return () => {
      cancelled = true;
      markers.current.clear();
      map?.remove();
    };
    // `mappable` is derived from `points`, which is the dependency that matters.
  }, [points, tileUrl, attribution, maxZoom, icon]);

  useEffect(() => {
    if (selectedId) markers.current.get(selectedId)?.openPopup();
  }, [selectedId]);

  if (mappable.length === 0) return null;
  return (
    <div
      ref={container}
      className={className}
      // An inline default height would beat a height set through `className`.
      style={className ? style : { height: "16rem", ...style }}
      role="region"
      aria-label={ariaLabel}
    />
  );
}
