"use client";

import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type TopSearch = { type: "grid" | "poi"; term: string; count: number };

export function TopSearchesSheet({ topSearches }: { topSearches: TopSearch[] }) {
  if (topSearches.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="secondary" size="sm" className="gap-1.5" />}>
        <Search size={15} />
        Zoekopdrachten
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Meest gezocht</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <ul className="space-y-1.5">
            {topSearches.map((s) => (
              <li key={`${s.type}-${s.term}`} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{s.type === "grid" ? "Grid" : "POI"}</Badge>
                  {s.term}
                </span>
                <span className="text-muted-foreground">{s.count}×</span>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
