"use client";

import { useMemo } from "react";
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
  title,
  shape,
  categories,
  visibleIds,
  counts,
  onToggle,
}: {
  title: string;
  shape: "circle" | "square";
  categories: C[];
  visibleIds: string[];
  counts: Map<string, number>;
  onToggle: (categoryId: string) => void;
}) {
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
    <AccordionItem value={title} className="rounded-lg border bg-muted/30 px-2 not-last:border-b">
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
            Alles
          </Button>
          <span className="text-xs text-muted-foreground">·</span>
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            onClick={selectNone}
            disabled={noneVisible}
          >
            Geen
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
}: {
  categories: EventMapPoiCategory[];
  visibleCategories: string[];
  onToggle: (categoryId: string) => void;
  pois?: { categoryId: string | null }[];
  areaCategories?: EventMapAreaCategory[];
  visibleAreaCategoryIds?: string[];
  onToggleArea?: (categoryId: string) => void;
  areas?: { categoryId: string | null }[];
}) {
  const poiCounts = useMemo(() => countByCategory(pois), [pois]);
  const areaCounts = useMemo(() => countByCategory(areas), [areas]);

  const hiddenPoiCount = categories.filter((c) => !visibleCategories.includes(c.id)).length;
  const hiddenAreaCount = (areaCategories ?? []).filter(
    (c) => !(visibleAreaCategoryIds ?? []).includes(c.id),
  ).length;
  const activeFilterCount = hiddenPoiCount + hiddenAreaCount;

  function resetAll() {
    for (const c of categories) {
      if (!visibleCategories.includes(c.id)) onToggle(c.id);
    }
    for (const c of areaCategories ?? []) {
      if (!(visibleAreaCategoryIds ?? []).includes(c.id)) onToggleArea?.(c.id);
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
        <span className="sr-only">Categorieën filteren</span>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader className="flex-row items-center justify-between space-y-0">
          <SheetTitle>Filters</SheetTitle>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="xs" className="h-6 text-xs" onClick={resetAll}>
              Wis filters
            </Button>
          )}
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">
          {categories.length === 0 && (!areaCategories || areaCategories.length === 0) && (
            <p className="text-sm text-muted-foreground">Geen categorieën ingesteld.</p>
          )}
          <Accordion multiple defaultValue={["POI-categorieën", "Areas"]} className="gap-3">
            {categories.length > 0 && (
              <FilterSection
                title="POI-categorieën"
                shape="circle"
                categories={categories}
                visibleIds={visibleCategories}
                counts={poiCounts}
                onToggle={onToggle}
              />
            )}
            {areaCategories && areaCategories.length > 0 && (
              <FilterSection
                title="Areas"
                shape="square"
                categories={areaCategories}
                visibleIds={visibleAreaCategoryIds ?? []}
                counts={areaCounts}
                onToggle={(id) => onToggleArea?.(id)}
              />
            )}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
