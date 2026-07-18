"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const ImageOverlayEditor = dynamic(() => import("./image-overlay-editor-inner"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export type { ImageOverlayEditorProps, EditMode } from "./image-overlay-editor-inner";
