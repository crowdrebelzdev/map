import type { poi, eventDay } from "@/db/schema";
import type { EventMapPoiCategory } from "@/components/event-map-view";

type PoiRow = typeof poi.$inferSelect;
type EventDayRow = typeof eventDay.$inferSelect;

/** Column order shared between CSV export (`poiToCsvRow`) and CSV import
 * (`PoiCsvImportDialog`) so a round-tripped file (export, edit in Excel, re-import) lines up
 * field-for-field. */
export const POI_CSV_HEADERS = [
  "Naam",
  "Categorie",
  "Beschrijving",
  "Lat",
  "Lng",
  "Dag",
  "Icoon",
  "Kleur",
  "Randkleur",
  "Eigenaar",
  "Grootte",
  "Start",
  "Eind",
  "Extra",
] as const;

export function poiToCsvRow(
  p: PoiRow,
  categoryById: Map<string, EventMapPoiCategory>,
  eventDayById: Map<string, EventDayRow>,
): (string | number)[] {
  return [
    p.name,
    categoryById.get(p.categoryId ?? "")?.label ?? "",
    p.description ?? "",
    p.lat,
    p.lng,
    p.eventDayId ? eventDayById.get(p.eventDayId)?.label || eventDayById.get(p.eventDayId)?.date || "" : "",
    p.icon ?? "",
    p.fillColor ?? "",
    p.borderColor ?? "",
    p.owner ?? "",
    p.size,
    p.startTime ?? "",
    p.endTime ?? "",
    p.extraFieldValues.map((f) => `${f.label}=${f.value}`).join(";"),
  ];
}

/** Maps CSV records keyed by `POI_CSV_HEADERS` onto the field names `importPoisCsv` expects. */
export function csvRecordsToImportRows(records: Record<string, string>[]) {
  return records.map((r) => ({
    name: r["Naam"] ?? "",
    categoryLabel: r["Categorie"] ?? "",
    description: r["Beschrijving"],
    lat: r["Lat"] ?? "",
    lng: r["Lng"] ?? "",
    dayLabel: r["Dag"],
    icon: r["Icoon"],
    fillColor: r["Kleur"],
    borderColor: r["Randkleur"],
    owner: r["Eigenaar"],
    size: r["Grootte"],
    startTime: r["Start"],
    endTime: r["Eind"],
    extra: r["Extra"],
  }));
}
