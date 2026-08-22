/** A live-location row is never deleted (see actions/live-location.ts) — this is purely a
 * display cutoff between "live" (bright, moving marker) and "last known" (greyed out, with a
 * timestamp) for a position that stopped updating. Shared between the map marker itself and
 * any "actief" count that needs to agree with what the marker shows. */
export const LIVE_LOCATION_STALE_MS = 3 * 60 * 1000;

export function isLiveLocation(updatedAt: Date) {
  return Date.now() - updatedAt.getTime() < LIVE_LOCATION_STALE_MS;
}
