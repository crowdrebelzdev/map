"use client";

import { useEffect, useRef, useState } from "react";

/** Reads a JSON array of ids back out of localStorage (e.g. a saved category-visibility
 * filter) — falls back safely on the server (no `window`), a first-ever visit (nothing
 * stored yet), or corrupted/foreign data in that key. */
function readStoredIds(key: string, fallback: string[]): string[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** A set of visible ids (POI categories, area categories, ...) for the operational map —
 * persisted to localStorage under `storageKey` so a refresh doesn't reset to "alles
 * zichtbaar". A freshly created id isn't in the persisted set yet — without the effect below
 * it'd default to hidden. Tracked against the ids seen on the *previous* render (via a ref,
 * not against the current visibility state), so an id the visitor deliberately hid isn't
 * mistaken for a brand-new one and silently re-shown on every render/reload. */
export function useVisibilityFilter(storageKey: string, allIds: string[]) {
  const [visibleIds, setVisibleIds] = useState<string[]>(() => readStoredIds(storageKey, allIds));

  const knownIdsRef = useRef<Set<string>>(new Set(allIds));
  useEffect(() => {
    const newlyAppeared = allIds.filter((id) => !knownIdsRef.current.has(id));
    knownIdsRef.current = new Set(allIds);
    if (newlyAppeared.length === 0) return;
    setVisibleIds((prev) => [...prev, ...newlyAppeared.filter((id) => !prev.includes(id))]);
  }, [allIds]);

  // Separate from the "auto-add new id" effect above, which still runs on top of whatever
  // was restored here.
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleIds));
  }, [storageKey, visibleIds]);

  function toggle(id: string) {
    setVisibleIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  return { visibleIds, toggle };
}
