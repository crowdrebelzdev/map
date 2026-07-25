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
  EventMapLiveUser,
  FlyToTarget,
} from "./event-map-view-inner";
