"use client";

import { useTranslations } from "next-intl";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** Lets the viewer scale every POI marker on the map up/down at once, independent of each
 * POI's own small/medium/large setting — purely a client-side display preference. */
export function PoiSizeControl({
  sizeMultiplier,
  onChange,
}: {
  sizeMultiplier: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("poiSize");
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="secondary" size="icon" className="pointer-events-auto shrink-0 shadow-md" />}
      >
        <Maximize2 size={16} />
        <span className="sr-only">{t("adjustSize")}</span>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-4">
          <p className="text-sm text-muted-foreground">{t("description")}</p>
          <Slider
            min={0.5}
            max={2}
            step={0.1}
            value={[sizeMultiplier]}
            onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
          />
          <p className="text-center text-xs text-muted-foreground">{Math.round(sizeMultiplier * 100)}%</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
