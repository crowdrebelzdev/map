import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { areaCategory, eventDay, eventMap, gridConfig, mapArea, poi, poiCategory } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasAnyEventAccess } from "@/lib/event-access";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { listMyMessages } from "@/actions/broadcasts";
import { mapTileUrlTemplate } from "@/lib/storage";
import { OperationalMap } from "@/components/operational-map";

// Anonymous visitors have no session to hold accountable, and this page always runs a
// handful of DB queries below — this caps how often one IP can repeat that for a single
// event, without touching proxy.ts (which deliberately has no DB access, see its comment).
const ANONYMOUS_VIEW_WINDOW_MS = 60_000;
const ANONYMOUS_VIEW_MAX = 30;

// Lets a visitor "Add to Home Screen" a shortcut straight to this event's map — see
// manifest.webmanifest/route.ts for why this is per-event instead of one root manifest.
// `appleWebApp`/`icons.apple` cover iOS Safari, which ignores the manifest file itself.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}): Promise<Metadata> {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  return {
    title: ev.name,
    manifest: `/events/${eventSlug}/map/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: ev.name,
      statusBarStyle: "default",
    },
    icons: { apple: "/manifest-icon" },
  };
}

export default async function StaffEventMapPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = session
    ? await getEventAccess(ev.id, { id: session.user.id, role: session.user.role ?? null })
    : null;
  const isStaff = access ? hasAnyEventAccess(access) : false;

  if (!isStaff) {
    if (ev.publicAccessMode === "members_only") {
      redirect(session ? "/events" : `/sign-in?redirect=/events/${eventSlug}/map`);
    }
    // public_anonymous / public_named: let the visitor through as a read-only public viewer,
    // rate-limited per IP since there's no session to hold accountable.
    const ip = await getClientIp();
    const allowed = await checkRateLimit(`map-page:${ip}:${ev.id}`, {
      windowMs: ANONYMOUS_VIEW_WINDOW_MS,
      max: ANONYMOUS_VIEW_MAX,
    });
    if (!allowed) {
      return (
        <div className="flex h-dvh items-center justify-center p-4 text-center text-sm text-muted-foreground">
          Te veel verzoeken. Probeer het over een minuut opnieuw.
        </div>
      );
    }
  }

  const [map, grid, pois, categories, areas, areaCategories, days, messages] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, ev.id) }),
    db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, ev.id) }),
    db.query.poi.findMany({ where: eq(poi.eventId, ev.id) }),
    db.query.poiCategory.findMany({
      where: eq(poiCategory.eventId, ev.id),
      orderBy: asc(poiCategory.sortOrder),
    }),
    db.query.mapArea.findMany({ where: eq(mapArea.eventId, ev.id) }),
    db.query.areaCategory.findMany({
      where: eq(areaCategory.eventId, ev.id),
      orderBy: asc(areaCategory.sortOrder),
    }),
    db.query.eventDay.findMany({ where: eq(eventDay.eventId, ev.id), orderBy: asc(eventDay.date) }),
    isStaff ? listMyMessages(ev.id) : Promise.resolve([]),
  ]);

  return (
    <OperationalMap
      eventId={ev.id}
      eventSlug={eventSlug}
      currentUserId={session?.user.id ?? null}
      isStaff={isStaff}
      publicAccessMode={ev.publicAccessMode}
      liveLocationEnabled={ev.liveLocationEnabled}
      map={map ?? null}
      tileUrlTemplate={map?.tileVersion ? mapTileUrlTemplate(ev.id, map.tileVersion) : null}
      grid={grid ?? null}
      pois={pois}
      categories={categories}
      areas={areas}
      areaCategories={areaCategories}
      eventDays={days}
      initialMessages={messages}
    />
  );
}
