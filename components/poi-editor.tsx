"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Layers, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { EventMapPoiCategory } from "@/components/event-map-view";
import { deletePoi, bulkMovePois, bulkDeletePois } from "@/actions/poi";
import { downloadCsv } from "@/lib/csv";
import { POI_CSV_HEADERS, poiToCsvRow } from "@/lib/poi-csv";
import { PoiCsvImportDialog } from "@/components/poi-csv-import-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { poi, eventDay, PoiExtraFieldValue } from "@/db/schema";

type PoiRow = typeof poi.$inferSelect;
type EventDayRow = typeof eventDay.$inferSelect;

const ALL_DAYS_VALUE = "__all__";

/** Shared row-editor for freeform label/value info — used by both the POI and area edit
 * sheets for their "extra informatie" section. */
export function FreeInfoEditor({
  rows,
  onChange,
}: {
  rows: PoiExtraFieldValue[];
  onChange: (rows: PoiExtraFieldValue[]) => void;
}) {
  function updateRow(i: number, patch: Partial<PoiExtraFieldValue>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...rows, { key: `free-${Date.now()}-${rows.length}`, label: "", value: "" }]);
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Extra informatie (vrij)</Label>
      {rows.map((row, i) => (
        <div key={row.key} className="flex items-center gap-1.5">
          <Input
            value={row.label}
            onChange={(e) => updateRow(i, { label: e.target.value })}
            placeholder="Naam (bv. Openingstijden)"
            className="h-7 flex-1 text-xs"
          />
          <Input
            value={row.value}
            onChange={(e) => updateRow(i, { value: e.target.value })}
            placeholder="Waarde"
            className="h-7 flex-1 text-xs"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => removeRow(i)}
          >
            <Trash2 />
            <span className="sr-only">Regel verwijderen</span>
          </Button>
        </div>
      ))}
      <Button variant="outline" size="xs" onClick={addRow} className="gap-1">
        <Plus className="size-3" />
        Regel toevoegen
      </Button>
    </div>
  );
}

/** Pure overview panel — lists POIs, exports CSV, and hands off clicks to the parent.
 * Editing itself happens in the right-side `PoiEditSheet`; this panel has no form. */
export function PoiList({
  eventId,
  eventSlug,
  pois,
  categories,
  eventDays,
  editMode,
  editingPoiId,
  onSelectPoi,
}: {
  eventId: string;
  eventSlug: string;
  pois: PoiRow[];
  categories: EventMapPoiCategory[];
  eventDays: EventDayRow[];
  editMode: boolean;
  editingPoiId: string | null;
  onSelectPoi: (p: PoiRow) => void;
}) {
  const router = useRouter();
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const eventDayById = useMemo(() => new Map(eventDays.map((d) => [d.id, d])), [eventDays]);
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeletePoi, setConfirmDeletePoi] = useState<PoiRow | null>(null);

  const poisByCategory = useMemo(() => {
    const map = new Map<string, PoiRow[]>();
    for (const p of pois) {
      const list = map.get(p.categoryId) ?? [];
      list.push(p);
      map.set(p.categoryId, list);
    }
    // `numeric: true` makes purely-numeric names sort as numbers ("2" before "10")
    // while still sorting non-numeric names alphabetically.
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    }
    return map;
  }, [pois]);

  function handleExportCsv() {
    downloadCsv(`poi-${eventSlug}.csv`, [...POI_CSV_HEADERS], pois.map((p) => poiToCsvRow(p, categoryById, eventDayById)));
  }

  async function handleDelete(poiId: string) {
    setDeletingId(poiId);
    try {
      await deletePoi(eventId, eventSlug, poiId);
      toast.success("POI verwijderd.");
      setConfirmDeletePoi(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Bestaande POI&apos;s ({pois.length})</CardTitle>
        <div className="flex items-center gap-1.5">
          <PoiCsvImportDialog eventId={eventId} eventSlug={eventSlug} />
          {pois.length > 0 && (
            <Button variant="outline" size="icon-sm" onClick={handleExportCsv}>
              <Download />
              <span className="sr-only">Exporteren als CSV</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {editMode && pois.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Klik op de kaart om een POI toe te voegen, of klik een bestaande om 'm te bewerken.
          </p>
        )}
        {pois.length === 0 ? (
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPin />
              </EmptyMedia>
              <EmptyTitle>Nog geen POI&apos;s</EmptyTitle>
              <EmptyDescription>
                {editMode
                  ? "Klik op de kaart om je eerste POI toe te voegen."
                  : "Schakel Bewerken in om POI's toe te voegen."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Accordion multiple className="gap-2">
            {sortedCategories.map((c) => {
              const catPois = poisByCategory.get(c.id) ?? [];
              if (catPois.length === 0) return null;
              return (
                <AccordionItem key={c.id} value={c.id} className="rounded-md border">
                  <AccordionTrigger className="items-center gap-2 p-2 text-sm font-medium hover:no-underline">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="flex-1 truncate text-left">{c.label}</span>
                    <Badge variant="secondary">{catPois.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-1.5 border-t p-2">
                    {catPois.map((p) => (
                      <div
                        key={p.id}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md border p-2",
                          editingPoiId === p.id && "border-primary bg-muted",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectPoi(p)}
                          className="flex flex-1 items-center gap-2 text-left"
                        >
                          <span className="text-sm font-medium">{p.name}</span>
                          {eventDays.length > 0 && p.eventDayId && (
                            <Badge variant="outline">
                              {eventDayById.get(p.eventDayId)?.label || eventDayById.get(p.eventDayId)?.date}
                            </Badge>
                          )}
                        </button>
                        {editMode && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeletePoi(p)}
                            disabled={deletingId === p.id}
                          >
                            Verwijderen
                          </Button>
                        )}
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>

      <AlertDialog
        open={confirmDeletePoi !== null}
        onOpenChange={(open) => !open && setConfirmDeletePoi(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>POI verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je &quot;{confirmDeletePoi?.name}&quot; wilt verwijderen? Dit kan niet
              ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirmDeletePoi && handleDelete(confirmDeletePoi.id)}
              disabled={deletingId !== null}
            >
              {deletingId !== null ? "Bezig..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** Step 1 of editing: categories are effectively "layers" of POIs, so editing starts by
 * picking which one you're focused on — every add/edit/drag action afterwards applies to
 * just that category until you go back and pick another. */
export function PoiCategoryLayerPicker({
  categories,
  pois,
  onSelect,
}: {
  categories: EventMapPoiCategory[];
  pois: PoiRow[];
  onSelect: (categoryId: string) => void;
}) {
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pois) map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + 1);
    return map;
  }, [pois]);
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kies een categorie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Categorieën zijn als het ware lagen — kies er eerst één om op te focussen, dan pas je
          POI&apos;s toe of bewerkt ze binnen die laag.
        </p>
        {categories.length === 0 ? (
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Layers />
              </EmptyMedia>
              <EmptyTitle>Nog geen categorieën</EmptyTitle>
              <EmptyDescription>Maak er eerst één aan via het tabblad "Categorieën".</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          sortedCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className="flex w-full items-center gap-2.5 rounded-md border p-2.5 text-left hover:bg-muted"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="flex-1 truncate text-sm font-medium">{c.label}</span>
              <Badge variant="secondary">{countByCategory.get(c.id) ?? 0}</Badge>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Step 2: the focused-category POI list — a flat list (no accordion needed, there's only
 * one category in view) with a way back to the layer picker. */
export function PoiFocusedCategoryList({
  eventId,
  eventSlug,
  category,
  categories,
  pois,
  eventDays,
  editingPoiId,
  onSelectPoi,
  onBack,
}: {
  eventId: string;
  eventSlug: string;
  category: EventMapPoiCategory;
  categories: EventMapPoiCategory[];
  pois: PoiRow[];
  eventDays: EventDayRow[];
  editingPoiId: string | null;
  onSelectPoi: (p: PoiRow) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const eventDayById = useMemo(() => new Map(eventDays.map((d) => [d.id, d])), [eventDays]);
  const sortedPois = useMemo(
    () => [...pois].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
    [pois],
  );
  const otherCategories = useMemo(
    () => categories.filter((c) => c.id !== category.id).sort((a, b) => a.label.localeCompare(b.label)),
    [categories, category.id],
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeletePoi, setConfirmDeletePoi] = useState<PoiRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string>("");

  // A different category was focused (or the list changed under us) — a stale selection
  // referencing POIs no longer shown here would be confusing.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [category.id]);

  const allSelected = sortedPois.length > 0 && selectedIds.size === sortedPois.length;

  function toggleSelected(poiId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(poiId)) next.delete(poiId);
      else next.add(poiId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(sortedPois.map((p) => p.id)));
  }

  async function handleDelete(poiId: string) {
    setDeletingId(poiId);
    try {
      await deletePoi(eventId, eventSlug, poiId);
      toast.success("POI verwijderd.");
      setConfirmDeletePoi(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    setBulkBusy(true);
    try {
      await bulkDeletePois(eventId, eventSlug, [...selectedIds]);
      toast.success(`${selectedIds.size} POI('s) verwijderd.`);
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkMove(targetCategoryId: string) {
    setBulkBusy(true);
    try {
      await bulkMovePois(eventId, eventSlug, [...selectedIds], { categoryId: targetCategoryId });
      toast.success(`${selectedIds.size} POI('s) verplaatst.`);
      setSelectedIds(new Set());
      setMoveTargetId("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verplaatsen mislukt.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={onBack}
          className="-m-1 flex items-center gap-2 rounded-md p-1 text-left hover:bg-muted"
        >
          <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
          <CardTitle className="flex-1 truncate">{category.label}</CardTitle>
          <Badge variant="secondary">{pois.length}</Badge>
        </button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Klik op de kaart om een POI toe te voegen aan &quot;{category.label}&quot;, of klik een
          bestaande om 'm te bewerken.
        </p>
        {sortedPois.length === 0 ? (
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPin />
              </EmptyMedia>
              <EmptyTitle>Nog geen POI&apos;s in deze categorie</EmptyTitle>
              <EmptyDescription>Klik op de kaart om de eerste toe te voegen.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b pb-2">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              <span className="text-xs text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} geselecteerd` : "Alles selecteren"}
              </span>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/50 p-2">
                <Select
                  value={moveTargetId}
                  onValueChange={(v) => {
                    if (!v) return;
                    setMoveTargetId(v);
                    handleBulkMove(v);
                  }}
                  disabled={bulkBusy || otherCategories.length === 0}
                >
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="Verplaats naar categorie...">
                      {(v: string) => otherCategories.find((c) => c.id === v)?.label ?? "Verplaats naar categorie..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {otherCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={bulkBusy}
                >
                  Verwijderen ({selectedIds.size})
                </Button>
              </div>
            )}

            {sortedPois.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border p-2",
                  editingPoiId === p.id && "border-primary bg-muted",
                )}
              >
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onCheckedChange={() => toggleSelected(p.id)}
                />
                <button
                  type="button"
                  onClick={() => onSelectPoi(p)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  {eventDays.length > 0 && p.eventDayId && (
                    <Badge variant="outline">
                      {eventDayById.get(p.eventDayId)?.label || eventDayById.get(p.eventDayId)?.date}
                    </Badge>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDeletePoi(p)}
                  disabled={deletingId === p.id}
                >
                  Verwijderen
                </Button>
              </div>
            ))}
          </>
        )}
      </CardContent>

      <AlertDialog
        open={confirmDeletePoi !== null}
        onOpenChange={(open) => !open && setConfirmDeletePoi(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>POI verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je &quot;{confirmDeletePoi?.name}&quot; wilt verwijderen? Dit kan niet
              ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirmDeletePoi && handleDelete(confirmDeletePoi.id)}
              disabled={deletingId !== null}
            >
              {deletingId !== null ? "Bezig..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedIds.size} POI&apos;s verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Annuleren</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleBulkDelete} disabled={bulkBusy}>
              {bulkBusy ? "Bezig..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
