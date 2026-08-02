"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxEmpty,
  ComboboxItem,
} from "@/components/ui/combobox";
import { FreeInfoEditor } from "@/components/poi-editor";
import { POI_ICON_OPTIONS, type PoiIconOption } from "@/lib/poi-icons";
import { createPoi, updatePoi } from "@/actions/poi";
import { computeTransform, latLngToPixel, type LatLng } from "@/lib/geo";
import type { PreviewPoiMarker } from "@/components/event-map-view";
import type { eventMap, poi, poiCategory, eventDay, PoiExtraFieldValue } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;
type PoiRow = typeof poi.$inferSelect;
type PoiCategoryRow = typeof poiCategory.$inferSelect;
type EventDayRow = typeof eventDay.$inferSelect;

// Same compact, non-blocking card as the read-only detail panel in event-map-view-inner.tsx
// (`DETAIL_PANEL_CLASSNAME`) — a bottom-sheet on mobile, a small top-right card on desktop.
const EDIT_PANEL_CLASSNAME =
  "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-xl border bg-background p-4 shadow-lg " +
  "sm:absolute sm:inset-x-auto sm:inset-y-auto sm:bottom-auto sm:left-auto sm:right-3 sm:top-3 sm:z-10 sm:w-80 sm:max-h-[calc(100%-1.5rem)] sm:rounded-lg sm:border sm:border-t";

const ALL_DAYS_VALUE = "__all__";

const INHERIT_ICON_VALUE = "__inherit__";
const NO_ICON_VALUE = "__none__";
type IconComboboxOption = { value: string; label: string; Icon?: PoiIconOption["Icon"] };

function PoiIconCombobox({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const t = useTranslations("poiEditSheet");
  const inheritOption: IconComboboxOption = { value: INHERIT_ICON_VALUE, label: t("inheritIconOption") };
  const noIconOption: IconComboboxOption = { value: NO_ICON_VALUE, label: t("noIconOption") };
  const options: IconComboboxOption[] = [inheritOption, noIconOption, ...POI_ICON_OPTIONS];
  const selected = options.find((o) => o.value === (value ?? INHERIT_ICON_VALUE)) ?? inheritOption;
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(opt: IconComboboxOption | null) =>
        onChange(opt && opt.value !== INHERIT_ICON_VALUE ? opt.value : null)
      }
      itemToStringLabel={(opt: IconComboboxOption) => opt.label}
      filter={(opt: IconComboboxOption, query: string) =>
        opt.label.toLowerCase().includes(query.trim().toLowerCase())
      }
    >
      <ComboboxInput placeholder={t("iconSearchPlaceholder")} className="h-8 text-xs" />
      <ComboboxContent className="max-h-72">
        <ComboboxEmpty>{t("noIconsFound")}</ComboboxEmpty>
        <ComboboxList>
          {(opt: IconComboboxOption) => (
            <ComboboxItem key={opt.value} value={opt}>
              <span className="flex items-center gap-2">
                {opt.Icon && <opt.Icon className="size-3.5" />}
                {opt.label}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function ColorOverrideField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("poiEditSheet");
  const enabled = value !== null;
  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={enabled} onCheckedChange={(v) => onChange(v ? fallback : null)} />
        {t("adjustLabel", { label })}
      </label>
      {enabled && (
        <input
          type="color"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-16 cursor-pointer rounded-md border border-input p-0.5"
        />
      )}
    </div>
  );
}

/** Right-side sheet with every editable POI field — the left panel (`PoiList`) stays a pure
 * overview; this is where "click a POI, adjust everything" actually happens. */
export function PoiEditSheet({
  eventId,
  eventSlug,
  map,
  pois,
  categories,
  eventDays,
  pendingLatLng,
  editPoiId,
  defaultCategoryId,
  onClose,
  onDraftChange,
}: {
  eventId: string;
  eventSlug: string;
  map: MapRow | null;
  pois: PoiRow[];
  categories: PoiCategoryRow[];
  eventDays: EventDayRow[];
  pendingLatLng: LatLng | null;
  editPoiId: string | null;
  /** Category a new POI should start out in — the "focused layer" chosen before adding. */
  defaultCategoryId?: string;
  onClose: () => void;
  /** Fired on every field change while creating a new POI, so the map can render a live
   * preview at pendingLatLng without waiting for a save. Fires `null` once there's nothing
   * to preview (editing an existing POI, or the panel is closed). */
  onDraftChange?: (draft: PreviewPoiMarker | null) => void;
}) {
  const router = useRouter();
  const t = useTranslations("poiEditSheet");
  const tc = useTranslations("common");
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const eventDayById = useMemo(() => new Map(eventDays.map((d) => [d.id, d])), [eventDays]);
  const editingPoi = editPoiId ? (pois.find((p) => p.id === editPoiId) ?? null) : null;
  const open = Boolean(pendingLatLng) || Boolean(editingPoi);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [eventDayId, setEventDayId] = useState<string>(ALL_DAYS_VALUE);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [fillColor, setFillColor] = useState<string | null>(null);
  const [borderColor, setBorderColor] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [extraFieldValues, setExtraFieldValues] = useState<PoiExtraFieldValue[]>([]);
  const [saving, setSaving] = useState(false);

  const transform = useMemo(() => {
    if (!map) return null;
    return computeTransform(map.imageWidth, map.imageHeight, {
      tl: { lat: map.cornerTlLat, lng: map.cornerTlLng },
      tr: { lat: map.cornerTrLat, lng: map.cornerTrLng },
      br: { lat: map.cornerBrLat, lng: map.cornerBrLng },
      bl: { lat: map.cornerBlLat, lng: map.cornerBlLng },
    });
  }, [map]);

  // Re-populate the whole form whenever *what's being edited* changes identity — a
  // different POI, or a fresh map click starting a new one. Not converted to the
  // key-remount pattern (see AreaEditSheet for that version): unlike an area, the
  // "new POI" case resets on every `pendingLatLng` object identity change (each map
  // click while the sheet is already open for a new POI), which a string `key` can't
  // express without also changing pendingLatLng's shape in the parent.
  useEffect(() => {
    if (editingPoi) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(editingPoi.name);
      setDescription(editingPoi.description ?? "");
      setCategoryId(editingPoi.categoryId);
      setEventDayId(editingPoi.eventDayId ?? ALL_DAYS_VALUE);
      setStartTime(editingPoi.startTime ?? "");
      setEndTime(editingPoi.endTime ?? "");
      setIcon(editingPoi.icon ?? null);
      setFillColor(editingPoi.fillColor ?? null);
      setBorderColor(editingPoi.borderColor ?? null);
      setOwner(editingPoi.owner ?? "");
      // Defensive: POIs created before extraFieldValues became an array (older schema
      // version stored a plain object) would otherwise crash the .filter() calls below.
      setExtraFieldValues(Array.isArray(editingPoi.extraFieldValues) ? editingPoi.extraFieldValues : []);
    } else if (pendingLatLng) {
      const cat = categoryById.get(defaultCategoryId ?? "") ?? categories[0];
      setName(cat?.autoNumberEnabled ? `${cat.autoNumberPrefix}${cat.autoNumberNext}${cat.autoNumberSuffix}` : "");
      setDescription("");
      setCategoryId(cat?.id ?? "");
      setEventDayId(ALL_DAYS_VALUE);
      setStartTime("");
      setEndTime("");
      setIcon(null);
      setFillColor(null);
      setBorderColor(null);
      setOwner("");
      setExtraFieldValues([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPoi?.id, pendingLatLng, defaultCategoryId]);

  // Live preview: while creating a brand-new POI, mirror every field change onto the map
  // marker immediately — no need to save first to see what it'll look like.
  useEffect(() => {
    if (!onDraftChange) return;
    if (pendingLatLng && !editingPoi) {
      onDraftChange({ lat: pendingLatLng.lat, lng: pendingLatLng.lng, name, categoryId, icon, fillColor, borderColor });
    } else {
      onDraftChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLatLng, editingPoi, name, categoryId, icon, fillColor, borderColor]);

  function handleCategoryChange(id: string) {
    setCategoryId(id);
    // Only auto-suggest a name for brand-new POIs — never overwrite an existing name.
    if (!editingPoi) {
      const cat = categoryById.get(id);
      if (cat?.autoNumberEnabled) {
        setName(`${cat.autoNumberPrefix}${cat.autoNumberNext}${cat.autoNumberSuffix}`);
      }
    }
  }

  const selectedCategoryExtraFields = categoryById.get(categoryId)?.extraFields ?? [];
  const templateKeys = new Set(selectedCategoryExtraFields.map((f) => f.key));
  const freeRows = extraFieldValues.filter((r) => !templateKeys.has(r.key));

  function getTemplateValue(key: string) {
    return extraFieldValues.find((r) => r.key === key)?.value ?? "";
  }
  function setTemplateValue(key: string, label: string, value: string) {
    setExtraFieldValues((prev) => {
      const others = prev.filter((r) => r.key !== key);
      if (!value.trim()) return others;
      return [...others, { key, label, value }];
    });
  }
  function handleFreeRowsChange(newFreeRows: PoiExtraFieldValue[]) {
    const templateRows = extraFieldValues.filter((r) => templateKeys.has(r.key));
    setExtraFieldValues([...templateRows, ...newFreeRows]);
  }

  async function handleSave() {
    if (!name.trim() || !categoryId) return;
    setSaving(true);
    try {
      const resolvedEventDayId = eventDayId === ALL_DAYS_VALUE ? null : eventDayId;
      if (editingPoi) {
        await updatePoi({
          eventId,
          eventSlug,
          poiId: editingPoi.id,
          categoryId,
          name,
          description,
          eventDayId: resolvedEventDayId,
          startTime: startTime || null,
          endTime: endTime || null,
          icon,
          fillColor,
          borderColor,
          owner,
          extraFieldValues,
        });
        toast.success(t("updatedToast"));
      } else {
        if (!pendingLatLng || !transform) return;
        const pixel = latLngToPixel(transform, pendingLatLng);
        await createPoi({
          eventId,
          eventSlug,
          categoryId,
          name,
          description,
          eventDayId: resolvedEventDayId,
          startTime: startTime || null,
          endTime: endTime || null,
          icon,
          fillColor,
          borderColor,
          owner,
          extraFieldValues,
          pixelX: pixel.x,
          pixelY: pixel.y,
          lat: pendingLatLng.lat,
          lng: pendingLatLng.lng,
        });
        toast.success(t("addedToast"));
      }
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorFallback"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className={cn(EDIT_PANEL_CLASSNAME)}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
        <span className="sr-only">{tc("close")}</span>
      </button>
      <p className="pr-8 font-semibold">{editingPoi ? t("editTitle") : t("addTitle")}</p>
      <div className="space-y-3 pt-3">
          <Field>
            <FieldLabel htmlFor="poi-name">{t("nameLabel")}</FieldLabel>
            <Input id="poi-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="poi-category">{tc("category")}</FieldLabel>
            <Select value={categoryId} onValueChange={(v) => handleCategoryChange(v ?? "")}>
              <SelectTrigger id="poi-category" className="w-full">
                <SelectValue>{() => categoryById.get(categoryId)?.label ?? t("chooseCategoryPlaceholder")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {eventDays.length > 0 && (
            <Field>
              <FieldLabel htmlFor="poi-day">{t("dayLabel")}</FieldLabel>
              <Select value={eventDayId} onValueChange={(v) => setEventDayId(v ?? ALL_DAYS_VALUE)}>
                <SelectTrigger id="poi-day" className="w-full">
                  <SelectValue>
                    {() =>
                      eventDayId === ALL_DAYS_VALUE
                        ? t("allDays")
                        : eventDayById.get(eventDayId)?.label || eventDayById.get(eventDayId)?.date || t("allDays")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DAYS_VALUE}>{t("allDays")}</SelectItem>
                  {eventDays.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label ? `${d.label} (${d.date})` : d.date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="poi-description">{t("descriptionLabel")}</FieldLabel>
            <Input id="poi-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="poi-owner">{t("ownerLabel")}</FieldLabel>
            <Input id="poi-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={t("ownerPlaceholder")} />
          </Field>
          <Field>
            <FieldLabel>{t("iconLabel")}</FieldLabel>
            <PoiIconCombobox value={icon} onChange={setIcon} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <ColorOverrideField
              label={t("fillColorLabel")}
              value={fillColor}
              fallback={categoryById.get(categoryId)?.color ?? "#2563eb"}
              onChange={setFillColor}
            />
            <ColorOverrideField label={t("borderColorLabel")} value={borderColor} fallback="#ffffff" onChange={setBorderColor} />
          </div>
          <Field>
            <FieldLabel>{t("timeWindowLabel")}</FieldLabel>
            <div className="flex items-center gap-2">
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="flex-1" />
              <span className="text-xs text-muted-foreground">{t("timeWindowTo")}</span>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="flex-1" />
            </div>
            <FieldDescription>{t("timeWindowHint")}</FieldDescription>
          </Field>
          {selectedCategoryExtraFields.length > 0 && (
            <div className="space-y-2 rounded-md border p-2">
              {selectedCategoryExtraFields.map((field) => (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`poi-extra-${field.key}`}>{field.label}</FieldLabel>
                  <Input
                    id={`poi-extra-${field.key}`}
                    type={field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text"}
                    value={getTemplateValue(field.key)}
                    onChange={(e) => setTemplateValue(field.key, field.label, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          )}
          <FreeInfoEditor rows={freeRows} onChange={handleFreeRowsChange} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? tc("saving") : editingPoi ? t("saveChanges") : tc("save")}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </Button>
          </div>
      </div>
    </div>
  );
}
