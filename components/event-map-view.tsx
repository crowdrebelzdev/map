"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const EventMapView = dynamic(() => import("./event-map-view-inner"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export type {
  EventMapViewProps,
  EventMapImage,
  EventMapPoi,
  EventMapPoiCategory,
  EventMapArea,
  EventMapAreaCategory,
  EventMapLiveUser,
  FlyToTarget,
  PoiSelectSignal,
  PreviewPoiMarker,
} from "./event-map-view-inner";
