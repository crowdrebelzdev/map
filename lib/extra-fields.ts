import type { PoiExtraFieldValue } from "@/db/schema";

const MAX_EXTRA_FIELD_VALUES = 15;

/** Each row carries its own label — not restricted to a category's extraFields template,
 * since a POI or area can also carry ad-hoc info that isn't part of any template. Shared
 * between actions/poi.ts and actions/areas.ts. */
export function sanitizeExtraFieldValues(values: PoiExtraFieldValue[] | undefined): PoiExtraFieldValue[] {
  if (!values) return [];
  if (values.length > MAX_EXTRA_FIELD_VALUES) {
    throw new Error(`Maximaal ${MAX_EXTRA_FIELD_VALUES} extra-informatieregels.`);
  }
  const seenKeys = new Set<string>();
  const result: PoiExtraFieldValue[] = [];
  for (const row of values) {
    const label = row.label.trim();
    const value = row.value.trim();
    if (!label || !value) continue;
    const key = row.key.trim() || label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    result.push({ key, label, value });
  }
  return result;
}
