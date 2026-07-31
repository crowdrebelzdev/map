"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";

export type GpsStatus = "locating" | "active" | "denied" | "unavailable" | "insecure" | "unsupported";

/** GPS + optional manual override for "where am I" on the operational map. `latestGpsRef`
 * exposes the latest *real* GPS fix outside React state so a caller (e.g. the periodic
 * live-location upload) can read it without re-running on every high-frequency GPS tick. */
export function useGpsPosition() {
  const [gpsPosition, setGpsPosition] = useState<LatLng | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("locating");
  const [manualPosition, setManualPosition] = useState<LatLng | null>(null);
  const [placingManually, setPlacingManually] = useState(false);
  const latestGpsRef = useRef<LatLng | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setGpsStatus("insecure");
      return;
    }
    if (!("geolocation" in navigator)) {
      setGpsStatus("unsupported");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus("active");
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsPosition(next);
        latestGpsRef.current = next;
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        latestGpsRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const userPosition = manualPosition ?? gpsPosition;
  const usingManualPosition = manualPosition !== null;

  function handleMapClickForManualLocation(latLng: LatLng) {
    setManualPosition(latLng);
    setPlacingManually(false);
  }

  function handleStopUsingManualLocation() {
    setManualPosition(null);
    setPlacingManually(false);
  }

  return {
    gpsStatus,
    userPosition,
    usingManualPosition,
    placingManually,
    setPlacingManually,
    latestGpsRef,
    handleMapClickForManualLocation,
    handleStopUsingManualLocation,
  };
}
