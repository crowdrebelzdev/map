"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Same rationale as event-map-view.tsx: `ssr: false` disables Next's automatic chunk
// preload, so warm the maplibre-gl chunk fetch as soon as this wrapper module evaluates.
if (typeof window !== "undefined") {
  void import("./image-overlay-editor-inner");
}

export const ImageOverlayEditor = dynamic(() => import("./image-overlay-editor-inner"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export type { ImageOverlayEditorProps, EditMode } from "./image-overlay-editor-inner";
