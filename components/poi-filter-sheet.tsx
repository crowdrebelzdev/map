"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { EventMapAreaCategory, EventMapPoiCategory } from "@/components/event-map-view";

function countByCategory(rows: { categoryId: string | null }[] | undefined) {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    if (!row.categoryId) continue;
    map.set(row.categoryId, (map.get(row.categoryId) ?? 0) + 1);
  }
  return map;
}

function FilterSection<C extends { id: string; label: string; color: string }>({
  id,
  title,
  shape,
  categories,
  visibleIds,
  counts,
  onToggle,
}: {
  id: string;
  title: string;
  shape: "circle" | "square";
  categories: C[];
  visibleIds: string[];
  counts: Map<string, number>;
  onToggle: (categoryId: string) => void;
}) {
  const t = useTranslations("poiFilter");
  const allVisible = categories.every((c) => visibleIds.includes(c.id));
  const noneVisible = categories.every((c) => !visibleIds.includes(c.id));

  function selectAll() {
    for (const c of categories) {
      if (!visibleIds.includes(c.id)) onToggle(c.id);
    }
  }
  function selectNone() {
    for (const c of categories) {
      if (visibleIds.includes(c.id)) onToggle(c.id);
    }
  }

  return (
    <AccordionItem value={id} className="rounded-lg border bg-muted/30 px-2 not-last:border-b">
      <AccordionTrigger className="items-center py-2 text-sm font-medium hover:no-underline">
        {title}
      </AccordionTrigger>
      <AccordionContent className="space-y-1 pb-2">
        <div className="flex items-center gap-1.5 px-2 pb-1.5">
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            onClick={selectAll}
            disabled={allVisible}
          >
            {t("all")}
          </Button>
          <span className="text-xs text-muted-foreground">·</span>
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            onClick={selectNone}
            disabled={noneVisible}
          >
            {t("none")}
          </Button>
        </div>
        {categories.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
          >
            <Checkbox checked={visibleIds.includes(c.id)} onCheckedChange={() => onToggle(c.id)} />
            <span
              className={cn("h-2.5 w-2.5 shrink-0", shape === "circle" ? "rounded-full" : "rounded-sm")}
              style={{ backgroundColor: c.color }}
            />
            <span className="flex-1 truncate text-sm">{c.label}</span>
            {counts.has(c.id) && (
              <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                {counts.get(c.id)}
              </Badge>
            )}
          </label>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

export function PoiFilterSheet({
  categories,
  visibleCategories,
  onToggle,
  pois,
  areaCategories,
  visibleAreaCategoryIds,
  onToggleArea,
  areas,
  liveUsers,
  visibleLiveUserIds,
  onToggleLiveUser,
}: {
  categories: EventMapPoiCategory[];
  visibleCategories: string[];
  onToggle: (categoryId: string) => void;
  pois?: { categoryId: string | null }[];
  areaCategories?: EventMapAreaCategory[];
  visibleAreaCategoryIds?: string[];
  onToggleArea?: (categoryId: string) => void;
  areas?: { categoryId: string | null }[];
  /** Live-ops-only "wie is zichtbaar" section — a per-viewer preference (see live-ops-view's
   * own localStorage-backed visibility filter), not a map-wide setting. Omitted entirely
   * (no section rendered) wherever this sheet is used without a live view, e.g. the field map. */
  liveUsers?: { id: string; label: string }[];
  visibleLiveUserIds?: string[];
  onToggleLiveUser?: (id: string) => void;
}) {
  const t = useTranslations("poiFilter");
  const poiCounts = useMemo(() => countByCategory(pois), [pois]);
  const areaCounts = useMemo(() => countByCategory(areas), [areas]);
  const emptyCounts = useMemo(() => new Map<string, number>(), []);
  const liveUserItems = useMemo(
    () => (liveUsers ?? []).map((u) => ({ id: u.id, label: u.label, color: "#6b7280" })),
    [liveUsers],
  );

  const hiddenPoiCount = categories.filter((c) => !visibleCategories.includes(c.id)).length;
  const hiddenAreaCount = (areaCategories ?? []).filter(
    (c) => !(visibleAreaCategoryIds ?? []).includes(c.id),
  ).length;
  const hiddenLiveUserCount = (liveUsers ?? []).filter(
    (u) => !(visibleLiveUserIds ?? []).includes(u.id),
  ).length;
  const activeFilterCount = hiddenPoiCount + hiddenAreaCount + hiddenLiveUserCount;

  function resetAll() {
    for (const c of categories) {
      if (!visibleCategories.includes(c.id)) onToggle(c.id);
    }
    for (const c of areaCategories ?? []) {
      if (!(visibleAreaCategoryIds ?? []).includes(c.id)) onToggleArea?.(c.id);
    }
    for (const u of liveUsers ?? []) {
      if (!(visibleLiveUserIds ?? []).includes(u.id)) onToggleLiveUser?.(u.id);
    }
  }

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto relative shrink-0 shadow-md"
          />
        }
      >
        <SlidersHorizontal size={16} />
        {activeFilterCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1.5 -right-1.5 h-4 min-w-4 justify-center px-1 text-[10px]"
          >
            {activeFilterCount}
          </Badge>
        )}
        <span className="sr-only">{t("filterCategories")}</span>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader className="flex-row items-center justify-between space-y-0">
          <SheetTitle>{t("filters")}</SheetTitle>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="xs" className="h-6 text-xs" onClick={resetAll}>
              {t("clearFilters")}
            </Button>
          )}
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">
          {categories.length === 0 && (!areaCategories || areaCategories.length === 0) && (
            <p className="text-sm text-muted-foreground">{t("noCategories")}</p>
          )}
          <Accordion multiple defaultValue={["poi-categories", "areas", "live-users"]} className="gap-3">
            {categories.length > 0 && (
              <FilterSection
                id="poi-categories"
                title={t("poiCategories")}
                shape="circle"
                categories={categories}
                visibleIds={visibleCategories}
                counts={poiCounts}
                onToggle={onToggle}
              />
            )}
            {areaCategories && areaCategories.length > 0 && (
              <FilterSection
                id="areas"
                title={t("areas")}
                shape="square"
                categories={areaCategories}
                visibleIds={visibleAreaCategoryIds ?? []}
                counts={areaCounts}
                onToggle={(id) => onToggleArea?.(id)}
              />
            )}
            {liveUserItems.length > 0 && (
              <FilterSection
                id="live-users"
                title="Live gebruikers"
                shape="circle"
                categories={liveUserItems}
                visibleIds={visibleLiveUserIds ?? []}
                counts={emptyCounts}
                onToggle={(id) => onToggleLiveUser?.(id)}
              />
            )}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
