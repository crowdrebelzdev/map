"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { EventMapPoiCategory } from "@/components/event-map-view";

export function PoiFilterSheet({
  categories,
  visibleCategories,
  onToggle,
}: {
  categories: EventMapPoiCategory[];
  visibleCategories: string[];
  onToggle: (categoryId: string) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="secondary" size="icon" className="pointer-events-auto shrink-0 shadow-md" />}
      >
        <SlidersHorizontal size={16} />
        <span className="sr-only">Categorieën filteren</span>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Categorieën</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 overflow-y-auto px-4 pb-4">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">Geen categorieën ingesteld.</p>
          )}
          {categories.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted"
            >
              <Checkbox
                checked={visibleCategories.includes(c.id)}
                onCheckedChange={() => onToggle(c.id)}
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="text-sm">{c.label}</span>
            </label>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
