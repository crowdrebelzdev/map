"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, Pencil, PanelLeft } from "lucide-react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  EventMapView,
  type EventMapArea,
  type EventMapAreaCategory,
  type EventMapPoi,
  type EventMapPoiCategory,
  type FlyToTarget,
  type PoiSelectSignal,
  type PreviewPoiMarker,
} from "@/components/event-map-view";
import { PoiList, PoiCategoryLayerPicker, PoiFocusedCategoryList } from "@/components/poi-editor";
import { PoiEditSheet } from "@/components/poi-edit-sheet";
import { PoiCategoryEditor } from "@/components/poi-category-editor";
import { AreaList } from "@/components/area-editor";
import { AreaEditSheet } from "@/components/area-edit-sheet";
import { PoiFilterSheet } from "@/components/poi-filter-sheet";
import { EventFullscreenHeader } from "@/components/event-fullscreen-header";
import { Button } from "@/components/ui/button";
import { movePoi } from "@/actions/poi";
import { cn } from "@/lib/utils";
import type { LatLng, GridCell } from "@/lib/geo";
import type { eventMap, gridConfig, poi, poiCategory, eventDay, mapArea, areaCategory } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;
type GridRow = typeof gridConfig.$inferSelect;
type PoiRow = typeof poi.$inferSelect;
type PoiCategoryRow = typeof poiCategory.$inferSelect;
type EventDayRow = typeof eventDay.$inferSelect;
type AreaRow = typeof mapArea.$inferSelect;
type AreaCategoryRow = typeof areaCategory.$inferSelect;

type Tab = "pois" | "categories" | "areas";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

function UndoShortcutHint() {
  const t = useTranslations("poiWorkspace");
  return (
    <span className="flex items-center gap-1.5">
      {t("undoMoveLabel")}
      <KbdGroup>
        <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
        <Kbd>Z</Kbd>
      </KbdGroup>
    </span>
  );
}

function areaBounds(vertices: LatLng[]): FlyToTarget {
  const lats = vertices.map((v) => v.lat);
  const lngs = vertices.map((v) => v.lng);
  return {
    type: "bounds",
    bounds: [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
  };
}

/** Fullscreen workspace (below the still-visible dashboard header) that shows one shared map
 * next to a left sidebar switching between the POI, category, and area panels — so a
 * category color/icon edit is visible on the same map immediately, no navigation needed.
 * Editing itself happens in right-side sheets (`PoiEditSheet`/`AreaEditSheet`); the sidebar
 * panels here stay pure overview lists. */
export function PoiWorkspace({
  eventId,
  eventSlug,
  eventName,
  tabs,
  map,
  tileUrlTemplate,
  grid,
  gridCells,
  pois,
  categories,
  areas,
  areaCategories,
  eventDays,
  canManagePois,
  canManageCategories,
  canManageAreas,
}: {
  eventId: string;
  eventSlug: string;
  eventName: string;
  tabs: { href: string; label: string }[];
  map: MapRow | null;
  tileUrlTemplate: string | null;
  grid: GridRow | null;
  gridCells: GridCell[];
  pois: PoiRow[];
  categories: PoiCategoryRow[];
  areas: AreaRow[];
  areaCategories: AreaCategoryRow[];
  eventDays: EventDayRow[];
  canManagePois: boolean;
  canManageCategories: boolean;
  canManageAreas: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("poiWorkspace");
  const tc = useTranslations("common");
  const TAB_LABELS: Record<Tab, string> = {
    pois: t("tabPois"),
    categories: t("tabCategories"),
    areas: t("tabAreas"),
  };
  const availableTabs: Tab[] = [
    canManagePois && "pois",
    canManageCategories && "categories",
    canManageAreas && "areas",
  ].filter((t): t is Tab => !!t);
  const [tab, setTab] = useState<Tab>(availableTabs[0] ?? "pois");
  const [pendingLatLng, setPendingLatLng] = useState<LatLng | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editPoiId, setEditPoiId] = useState<string | null>(null);
  const [focusedPoiCategoryId, setFocusedPoiCategoryId] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<PreviewPoiMarker | null>(null);
  const [drawingVertices, setDrawingVertices] = useState<LatLng[] | null>(null);
  const [editAreaId, setEditAreaId] = useState<string | null>(null);
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);
  const [flyTarget, setFlyTarget] = useState<FlyToTarget | null>(null);
  const [selectPoiSignal, setSelectPoiSignal] = useState<PoiSelectSignal | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visibleCategoryIds, setVisibleCategoryIds] = useState<string[]>(categories.map((c) => c.id));
  const [visibleAreaCategoryIds, setVisibleAreaCategoryIds] = useState<string[]>(
    areaCategories.map((c) => c.id),
  );
  const lastMoveRef = useRef<{ poiId: string; poiName: string; from: LatLng } | null>(null);

  // A freshly created category isn't in `visibleCategoryIds` yet (that state was only seeded
  // from `categories` once, at mount) — without this it'd default to hidden in the filters.
  // Merges new ids into existing state rather than resetting it, so a key-remount (which
  // would also discard the user's existing show/hide choices) isn't an option here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCategoryIds((prev) => {
      const newIds = categories.map((c) => c.id).filter((id) => !prev.includes(id));
      return newIds.length > 0 ? [...prev, ...newIds] : prev;
    });
  }, [categories]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleAreaCategoryIds((prev) => {
      const newIds = areaCategories.map((c) => c.id).filter((id) => !prev.includes(id));
      return newIds.length > 0 ? [...prev, ...newIds] : prev;
    });
  }, [areaCategories]);

  const undoMove = useCallback(
    async (poiId: string, poiName: string, from: LatLng) => {
      lastMoveRef.current = null;
      try {
        await movePoi(eventId, eventSlug, poiId, from.lat, from.lng);
        toast.success(t("undoneToast", { name: poiName }));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("undoErrorFallback"));
      }
    },
    [eventId, eventSlug, router, t],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const move = lastMoveRef.current;
      if (!move) return;
      e.preventDefault();
      undoMove(move.poiId, move.poiName, move.from);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoMove]);

  function handleTabChange(next: Tab) {
    setTab(next);
    setPendingLatLng(null);
    setEditPoiId(null);
    setFocusedPoiCategoryId(null);
    setDrawingVertices(null);
    setEditAreaId(null);
    setAreaSheetOpen(false);
  }

  function handleModeChange(next: boolean) {
    setEditMode(next);
    setPendingLatLng(null);
    setEditPoiId(null);
    setFocusedPoiCategoryId(null);
    setDrawingVertices(null);
    setEditAreaId(null);
    setAreaSheetOpen(false);
  }

  function handleClosePoiSheet() {
    setPendingLatLng(null);
    setEditPoiId(null);
  }

  function handleSelectPoi(p: PoiRow) {
    if (editMode) {
      setPendingLatLng(null);
      setEditPoiId(p.id);
      setSidebarOpen(true);
    } else {
      setFlyTarget({ type: "point", center: { lat: p.lat, lng: p.lng }, zoom: 19 });
      setSelectPoiSignal({ id: p.id, token: Date.now() });
      // The detail panel resolves the POI from the map's own visible/filtered list — if its
      // category is currently toggled off there, the panel would silently find nothing.
      setVisibleCategoryIds((prev) => (prev.includes(p.categoryId) ? prev : [...prev, p.categoryId]));
    }
  }

  function handlePoiClick(p: EventMapPoi) {
    if (!editMode || p.categoryId !== focusedPoiCategoryId) return;
    setPendingLatLng(null);
    setEditPoiId(p.id);
    setSidebarOpen(true);
  }

  function handleMapClickForPoi(latLng: LatLng) {
    setEditPoiId(null);
    setPendingLatLng(latLng);
    setSidebarOpen(true);
  }

  async function handlePoiDragEnd(poiId: string, latLng: LatLng) {
    const poiBeforeMove = pois.find((p) => p.id === poiId);
    try {
      await movePoi(eventId, eventSlug, poiId, latLng.lat, latLng.lng);
      if (poiBeforeMove) {
        const from = { lat: poiBeforeMove.lat, lng: poiBeforeMove.lng };
        lastMoveRef.current = { poiId, poiName: poiBeforeMove.name, from };
        toast.success(t("movedToast"), {
          action: { label: <UndoShortcutHint />, onClick: () => undoMove(poiId, poiBeforeMove.name, from) },
        });
      } else {
        toast.success(t("movedToast"));
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("moveErrorFallback"));
    }
  }

  function handleEditArea(a: AreaRow) {
    setEditAreaId(a.id);
    setDrawingVertices(a.vertices);
    setAreaSheetOpen(true);
    setSidebarOpen(true);
  }

  function handleSelectArea(a: AreaRow) {
    if (editMode) {
      handleEditArea(a);
    } else if (a.vertices.length > 0) {
      setFlyTarget(areaBounds(a.vertices));
    }
  }

  function handleAreaClick(a: EventMapArea) {
    if (!editMode) return;
    const area = areas.find((row) => row.id === a.id);
    if (area) handleEditArea(area);
  }

  function handleStartDrawingArea() {
    setEditAreaId(null);
    setDrawingVertices([]);
    setAreaSheetOpen(false);
  }

  function handleFinishDrawingArea() {
    if ((drawingVertices?.length ?? 0) >= 3) setAreaSheetOpen(true);
  }

  function handleCancelArea() {
    setDrawingVertices(null);
    setEditAreaId(null);
    setAreaSheetOpen(false);
  }

  function handleAreaVertexAdd(latLng: LatLng) {
    setDrawingVertices((prev) => (prev ? [...prev, latLng] : [latLng]));
  }

  function handleAreaVertexDrag(index: number, latLng: LatLng) {
    setDrawingVertices((prev) => (prev ? prev.map((v, i) => (i === index ? latLng : v)) : prev));
  }

  function handleAreaVertexRemove(index: number) {
    setDrawingVertices((prev) => {
      if (!prev || prev.length <= 3) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function toggleCategory(categoryId: string) {
    setVisibleCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId],
    );
  }

  function toggleAreaCategory(categoryId: string) {
    setVisibleAreaCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId],
    );
  }

  const mapCategories: EventMapPoiCategory[] = categories.map((c) => ({
    id: c.id,
    label: c.label,
    color: c.color,
    icon: c.icon,
    extraFields: c.extraFields,
  }));

  const mapPois: EventMapPoi[] = pois.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    categoryId: p.categoryId,
    lat: p.lat,
    lng: p.lng,
    size: p.size,
    icon: p.icon,
    fillColor: p.fillColor,
    borderColor: p.borderColor,
    owner: p.owner,
    extraFieldValues: p.extraFieldValues,
  }));

  const mapAreaCategories: EventMapAreaCategory[] = areaCategories.map((c) => ({
    id: c.id,
    label: c.label,
    color: c.color,
    extraFields: c.extraFields,
  }));

  const focusedCategory = mapCategories.find((c) => c.id === focusedPoiCategoryId) ?? null;

  // While a category is focused for editing, the map should only show that layer's POIs —
  // regardless of whatever the general filter-sheet visibility is currently set to.
  const mapVisibleCategoryIds =
    editMode && tab === "pois" && focusedPoiCategoryId ? [focusedPoiCategoryId] : visibleCategoryIds;

  const mapAreas: EventMapArea[] = areas.map((a) => ({
    id: a.id,
    name: a.name,
    categoryId: a.categoryId,
    vertices: a.vertices,
    extraFieldValues: a.extraFieldValues,
  }));

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col bg-background">
      <EventFullscreenHeader eventSlug={eventSlug} eventName={eventName} tabs={tabs} />
      <div className="relative flex min-h-0 flex-1">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => setSidebarOpen((o) => !o)}
        className="absolute left-3 top-3 z-20 lg:hidden"
      >
        <PanelLeft />
        <span className="sr-only">{t("toggleSidebarSr")}</span>
      </Button>

      <div
        className={cn(
          "absolute inset-y-0 left-0 z-30 w-80 max-w-[85vw] -translate-x-full overflow-y-auto border-r bg-background p-4 shadow-lg transition-transform duration-200",
          "lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:shadow-none",
          sidebarOpen && "translate-x-0",
        )}
      >
        <div className="mb-4 flex items-center gap-2">
          {availableTabs.length > 1 && (
            <div className="flex flex-1 gap-1 rounded-md bg-muted p-1">
              {availableTabs.map((tabKey) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => handleTabChange(tabKey)}
                  className={cn(
                    "flex-1 rounded-sm py-1.5 text-sm font-medium transition-colors",
                    tab === tabKey ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {TAB_LABELS[tabKey]}
                </button>
              ))}
            </div>
          )}
          <PoiFilterSheet
            categories={mapCategories}
            visibleCategories={visibleCategoryIds}
            onToggle={toggleCategory}
            pois={pois}
            areaCategories={mapAreaCategories}
            visibleAreaCategoryIds={visibleAreaCategoryIds}
            onToggleArea={toggleAreaCategory}
            areas={areas}
          />
        </div>

        {(tab === "pois" || tab === "areas") && (
          <div className="mb-4 flex gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              onClick={() => handleModeChange(false)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-sm py-1.5 text-sm font-medium transition-colors",
                !editMode
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eye className="size-3.5" />
              {t("viewMode")}
            </button>
            <button
              type="button"
              onClick={() => handleModeChange(true)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-sm py-1.5 text-sm font-medium transition-colors",
                editMode
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="size-3.5" />
              {tc("edit")}
            </button>
          </div>
        )}

        {tab === "pois" && canManagePois && (
          editMode ? (
            focusedCategory === null ? (
              <PoiCategoryLayerPicker
                categories={mapCategories}
                pois={pois}
                onSelect={setFocusedPoiCategoryId}
              />
            ) : (
              <PoiFocusedCategoryList
                eventId={eventId}
                eventSlug={eventSlug}
                category={focusedCategory}
                categories={mapCategories}
                pois={pois.filter((p) => p.categoryId === focusedCategory.id)}
                eventDays={eventDays}
                editingPoiId={editPoiId}
                onSelectPoi={handleSelectPoi}
                onBack={() => setFocusedPoiCategoryId(null)}
              />
            )
          ) : (
            <PoiList
              eventId={eventId}
              eventSlug={eventSlug}
              pois={pois}
              categories={mapCategories}
              eventDays={eventDays}
              editMode={editMode}
              editingPoiId={editPoiId}
              onSelectPoi={handleSelectPoi}
            />
          )
        )}
        {tab === "categories" && canManageCategories && (
          <PoiCategoryEditor eventId={eventId} eventSlug={eventSlug} categories={categories} />
        )}
        {tab === "areas" && canManageAreas && (
          <AreaList
            eventId={eventId}
            eventSlug={eventSlug}
            areas={areas}
            categories={mapAreaCategories}
            editMode={editMode}
            drawingVertices={drawingVertices}
            onStartDrawing={handleStartDrawingArea}
            onFinishDrawing={handleFinishDrawingArea}
            onCancelDrawing={handleCancelArea}
            editingAreaId={editAreaId}
            onSelectArea={handleSelectArea}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <EventMapView
          mapImage={
            map
              ? {
                  imageUrl: map.imageUrl,
                  displayImageUrl: map.displayImageUrl,
                  corners: {
                    tl: { lat: map.cornerTlLat, lng: map.cornerTlLng },
                    tr: { lat: map.cornerTrLat, lng: map.cornerTrLng },
                    br: { lat: map.cornerBrLat, lng: map.cornerBrLng },
                    bl: { lat: map.cornerBlLat, lng: map.cornerBlLng },
                  },
                  lockOrientation: map.lockOrientation,
                  bearing: map.bearing,
                  tiles:
                    tileUrlTemplate && map.tileMinZoom != null && map.tileMaxZoom != null
                      ? {
                          urlTemplate: tileUrlTemplate,
                          minZoom: map.tileMinZoom,
                          maxZoom: map.tileMaxZoom,
                          tileSize: map.tileSize ?? 512,
                        }
                      : null,
                }
              : null
          }
          gridCells={gridCells}
          gridTransformInput={
            grid
              ? {
                  corners: {
                    tl: { lat: grid.cornerTlLat, lng: grid.cornerTlLng },
                    tr: { lat: grid.cornerTrLat, lng: grid.cornerTrLng },
                    br: { lat: grid.cornerBrLat, lng: grid.cornerBrLng },
                    bl: { lat: grid.cornerBlLat, lng: grid.cornerBlLng },
                  },
                  columns: grid.columns,
                  rows: grid.rows,
                }
              : undefined
          }
          gridLineColor={grid?.lineColor}
          gridLineWidth={grid?.lineWidth}
          gridCasingColor={grid?.casingColor}
          gridCasingWidth={grid?.casingWidth}
          pois={mapPois}
          categories={mapCategories}
          visibleCategories={mapVisibleCategoryIds}
          areas={mapAreas}
          areaCategories={mapAreaCategories}
          visibleAreaCategoryIds={visibleAreaCategoryIds}
          onAreaClick={editMode && tab === "areas" ? handleAreaClick : undefined}
          drawingVertices={tab === "areas" ? drawingVertices : null}
          onDrawingVertexAdd={handleAreaVertexAdd}
          onDrawingVertexDrag={handleAreaVertexDrag}
          onDrawingVertexRemove={handleAreaVertexRemove}
          onMapClick={
            editMode && tab === "pois" && canManagePois && focusedPoiCategoryId ? handleMapClickForPoi : undefined
          }
          onPoiClick={editMode && tab === "pois" && focusedPoiCategoryId ? handlePoiClick : undefined}
          externalSelectPoi={!editMode ? selectPoiSignal : undefined}
          draggablePois={
            editMode && tab === "pois" && focusedPoiCategoryId
              ? (p: EventMapPoi) => p.categoryId === focusedPoiCategoryId
              : false
          }
          onPoiDragEnd={editMode && tab === "pois" && focusedPoiCategoryId ? handlePoiDragEnd : undefined}
          previewMarker={previewDraft}
          flyToTarget={flyTarget}
          className="h-full w-full"
        />
      </div>
      </div>

      <PoiEditSheet
        eventId={eventId}
        eventSlug={eventSlug}
        map={map}
        pois={pois}
        categories={categories}
        eventDays={eventDays}
        pendingLatLng={pendingLatLng}
        editPoiId={editPoiId}
        defaultCategoryId={focusedPoiCategoryId ?? undefined}
        onClose={handleClosePoiSheet}
        onDraftChange={setPreviewDraft}
      />
      <AreaEditSheet
        eventId={eventId}
        eventSlug={eventSlug}
        areas={areas}
        categories={mapAreaCategories}
        drawingVertices={drawingVertices}
        editAreaId={editAreaId}
        open={areaSheetOpen}
        onClose={handleCancelArea}
      />
    </div>
  );
}
