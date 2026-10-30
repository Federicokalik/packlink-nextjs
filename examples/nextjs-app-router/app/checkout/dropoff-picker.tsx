"use client";

import "leaflet/dist/leaflet.css";

import { useEffect } from "react";
import type { ShippingOption } from "packlink-nextjs";
import { DropoffPointMap } from "packlink-nextjs/map";
import { useDropoffPoints } from "packlink-nextjs/react";

/**
 * Shown under the shipping options when the selected one needs a pickup
 * point. Keep the "Continue" button disabled while `onChange` reports `null`,
 * and send the id with the order: the server needs it to create the label.
 */
export function DropoffPicker({
  option,
  zip,
  country,
  onChange,
}: {
  option: ShippingOption | null;
  zip: string;
  country: string;
  onChange: (pointId: string | null) => void;
}) {
  const { points, loading, error, selectedId, select } = useDropoffPoints({
    serviceId: option?.packlinkServiceId,
    zip,
    country,
    enabled: Boolean(option?.requiresDropoff),
  });

  useEffect(() => onChange(selectedId), [selectedId, onChange]);

  if (!option?.requiresDropoff) return null;
  if (loading) return <p>Looking for pickup points near you…</p>;
  if (error)
    return <p role="alert">Pickup points are not available right now. Try again shortly.</p>;
  if (points.length === 0) return <p>No pickup point for this service and zip code.</p>;

  return (
    <fieldset>
      <legend>Choose a pickup point</legend>
      <DropoffPointMap
        points={points}
        selectedId={selectedId}
        onSelect={select}
        style={{ height: 256, borderRadius: 8 }}
      />
      <ul style={{ maxHeight: 192, overflowY: "auto", listStyle: "none", padding: 0 }}>
        {points.map((point) => (
          <li key={point.id}>
            <label>
              <input
                type="radio"
                name="dropoff-point"
                value={point.id}
                checked={selectedId === point.id}
                onChange={() => select(point.id)}
              />{" "}
              <strong>{point.name || point.address}</strong> — {point.address}, {point.zip}{" "}
              {point.city}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
