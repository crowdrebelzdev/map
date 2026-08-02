"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FreeInfoEditor } from "@/components/poi-editor";
import type { EventMapAreaCategory } from "@/components/event-map-view";
import { createArea, updateArea } from "@/actions/areas";
import { cn } from "@/lib/utils";
import type { LatLng } from "@/lib/geo";
import type { mapArea, PoiExtraFieldValue } from "@/db/schema";

type AreaRow = typeof mapArea.$inferSelect;

// Same compact, non-blocking card as the read-only detail panel in event-map-view-inner.tsx
// (`DETAIL_PANEL_CLASSNAME`) — a bottom-sheet on mobile, a small top-right card on desktop.
const EDIT_PANEL_CLASSNAME =
  "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-xl border bg-background p-4 shadow-lg " +
  "sm:absolute sm:inset-x-auto sm:inset-y-auto sm:bottom-auto sm:left-auto sm:right-3 sm:top-3 sm:z-10 sm:w-80 sm:max-h-[calc(100%-1.5rem)] sm:rounded-lg sm:border sm:border-t";

/** Right-side sheet for an area's name/category/extra-info — opened once the outline is
 * drawn (or an existing area is picked). The outline itself stays a map/left-panel affair.
 * Thin wrapper around AreaEditForm: only resolves `editingArea` and decides whether to
 * render at all. Keying the form by the area's identity (see below) is what makes it
 * re-initialize its fields when the user switches from editing one area to another, or
 * from "add new" to "edit" — without a reset-on-prop-change effect. */
export function AreaEditSheet({
  eventId,
  eventSlug,
  areas,
  categories,
  drawingVertices,
  editAreaId,
  open,
  onClose,
}: {
  eventId: string;
  eventSlug: string;
  areas: AreaRow[];
  categories: EventMapAreaCategory[];
  drawingVertices: LatLng[] | null;
  editAreaId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const editingArea = editAreaId ? (areas.find((a) => a.id === editAreaId) ?? null) : null;
  if (!open) return null;
  return (
    <AreaEditForm
      key={editingArea?.id ?? "new"}
      eventId={eventId}
      eventSlug={eventSlug}
      categories={categories}
      editingArea={editingArea}
      drawingVertices={drawingVertices}
      onClose={onClose}
    />
  );
}

function AreaEditForm({
  eventId,
  eventSlug,
  categories,
  editingArea,
  drawingVertices,
  onClose,
}: {
  eventId: string;
  eventSlug: string;
  categories: EventMapAreaCategory[];
  editingArea: AreaRow | null;
  drawingVertices: LatLng[] | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("areaEditSheet");
  const tc = useTranslations("common");
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const [name, setName] = useState(editingArea?.name ?? "");
  const [categoryId, setCategoryId] = useState<string>(editingArea?.categoryId ?? categories[0]?.id ?? "");
  const [extraFieldValues, setExtraFieldValues] = useState<PoiExtraFieldValue[]>(
    editingArea && Array.isArray(editingArea.extraFieldValues) ? editingArea.extraFieldValues : [],
  );
  const [saving, setSaving] = useState(false);

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
    if (!name.trim() || !categoryId || !drawingVertices || drawingVertices.length < 3) return;
    setSaving(true);
    try {
      if (editingArea) {
        await updateArea({
          eventId,
          eventSlug,
          areaId: editingArea.id,
          categoryId,
          name,
          vertices: drawingVertices,
          extraFieldValues,
        });
        toast.success(t("updatedToast"));
      } else {
        await createArea({ eventId, eventSlug, categoryId, name, vertices: drawingVertices, extraFieldValues });
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
      <p className="pr-8 font-semibold">{editingArea ? t("editTitle") : t("addTitle")}</p>
      <div className="space-y-3 pt-3">
          <Field>
            <FieldLabel htmlFor="area-name">{tc("name")}</FieldLabel>
            <Input id="area-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="area-category">{tc("category")}</FieldLabel>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
              <SelectTrigger id="area-category" className="w-full">
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
          {selectedCategoryExtraFields.length > 0 && (
            <div className="space-y-2 rounded-md border p-2">
              {selectedCategoryExtraFields.map((field) => (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`area-extra-${field.key}`}>{field.label}</FieldLabel>
                  <Input
                    id={`area-extra-${field.key}`}
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
              {saving ? tc("saving") : editingArea ? t("saveChanges") : tc("save")}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </Button>
          </div>
      </div>
    </div>
  );
}
