import Link from "next/link";
import { CheckCircle2, Circle, MapPin, Radio, ShieldAlert, Users } from "lucide-react";
import { and, asc, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { eventMap, gridConfig, poi, poiCategory, eventMember, eventDay, incident, liveLocation } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasEventPermission } from "@/lib/event-access";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventDaysManager } from "@/components/event-days-manager";
import { TopSearchesCard } from "@/components/top-searches-card";
import { SearchActivityChart } from "@/components/search-activity-chart";
import { ActivityStatsChart, type ActivityStatsPoint } from "@/components/activity-stats-chart";
import { ExportEventPdfButton } from "@/components/export-event-pdf-button";
import { getSearchActivityByDay } from "@/actions/search-log";
import { getIncidentStats } from "@/actions/incidents";
import { getBroadcastStats } from "@/actions/broadcasts";

/** Merges two {day, count} series (incidents, broadcasts) into one chart-friendly series,
 * filling in days that only appear in one of them with 0. */
function mergeActivityStats(
  incidents: { day: string; count: number }[],
  broadcasts: { day: string; count: number }[],
): ActivityStatsPoint[] {
  const byDay = new Map<string, ActivityStatsPoint>();
  for (const { day, count: c } of incidents) byDay.set(day, { day, incidents: c, broadcasts: 0 });
  for (const { day, count: c } of broadcasts) {
    const existing = byDay.get(day);
    if (existing) existing.broadcasts = c;
    else byDay.set(day, { day, incidents: 0, broadcasts: c });
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// A live-location row this recent counts as "currently on the map" — matches the 20s
// upload interval in operational-map.tsx with generous slack for a missed beat or two.
const ACTIVE_WINDOW_MS = 3 * 60 * 1000;

export default async function EventOverviewPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = await getEventAccess(ev.id, { id: session!.user.id, role: session!.user.role ?? null });
  const canViewIncidents = hasEventPermission(access, "manage_incidents");
  const canViewLive = hasEventPermission(access, "view_live_locations");

  const [
    map,
    grid,
    [{ value: categoryCount }],
    [{ value: poiCount }],
    [{ value: memberCount }],
    [{ value: openIncidentCount }],
    [{ value: activeLiveCount }],
    days,
    searchActivity,
    incidentStats,
    broadcastStats,
  ] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, ev.id) }),
    db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, ev.id) }),
    db.select({ value: count() }).from(poiCategory).where(eq(poiCategory.eventId, ev.id)),
    db.select({ value: count() }).from(poi).where(eq(poi.eventId, ev.id)),
    db.select({ value: count() }).from(eventMember).where(eq(eventMember.eventId, ev.id)),
    canViewIncidents
      ? db
          .select({ value: count() })
          .from(incident)
          .where(and(eq(incident.eventId, ev.id), eq(incident.status, "open")))
      : Promise.resolve([{ value: 0 }]),
    canViewLive
      ? db
          .select({ value: count() })
          .from(liveLocation)
          .where(
            and(eq(liveLocation.eventId, ev.id), gte(liveLocation.updatedAt, new Date(Date.now() - ACTIVE_WINDOW_MS))),
          )
      : Promise.resolve([{ value: 0 }]),
    db.query.eventDay.findMany({ where: eq(eventDay.eventId, ev.id), orderBy: asc(eventDay.date) }),
    access.isAdmin ? getSearchActivityByDay(ev.id) : Promise.resolve([]),
    canViewIncidents ? getIncidentStats(ev.id) : Promise.resolve([]),
    canViewIncidents ? getBroadcastStats(ev.id) : Promise.resolve([]),
  ]);

  const activityStats = mergeActivityStats(incidentStats, broadcastStats);

  const [exportPois, exportCategories] = access.isAdmin
    ? await Promise.all([
        db.query.poi.findMany({ where: eq(poi.eventId, ev.id) }),
        db.query.poiCategory.findMany({ where: eq(poiCategory.eventId, ev.id) }),
      ])
    : [[], []];

  const items = [
    {
      label: "Plattegrond geüpload en ankerpunten ingesteld",
      done: !!map,
      href: `/org/events/${eventSlug}/map`,
    },
    {
      label: "Grid ingesteld",
      done: !!grid,
      href: `/org/events/${eventSlug}/map`,
    },
    {
      label: "Categorieën aangemaakt",
      done: categoryCount > 0,
      href: `/org/events/${eventSlug}/pois`,
    },
    {
      label: "POI's geplaatst",
      done: poiCount > 0,
      href: `/org/events/${eventSlug}/pois`,
    },
    {
      label: "Team toegewezen",
      done: memberCount > 0,
      href: `/org/events/${eventSlug}/team`,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;

  const stats = [
    { label: "POI's", value: poiCount, icon: MapPin, href: `/org/events/${eventSlug}/pois` },
    { label: "Teamleden", value: memberCount, icon: Users, href: `/org/events/${eventSlug}/team` },
    canViewIncidents && {
      label: "Open meldingen",
      value: openIncidentCount,
      icon: ShieldAlert,
      href: `/org/events/${eventSlug}/live`,
      alert: openIncidentCount > 0,
    },
    canViewLive && {
      label: "Live op de kaart",
      value: activeLiveCount,
      icon: Radio,
      href: `/org/events/${eventSlug}/live`,
    },
  ].filter((s): s is Exclude<typeof s, false> => !!s);

  return (
    <div className="space-y-4">
      {access.isAdmin && (
        <div className="flex justify-end">
          <ExportEventPdfButton
            eventName={ev.name}
            map={map ? { imageUrl: map.imageUrl, imageWidth: map.imageWidth, imageHeight: map.imageHeight } : null}
            pois={exportPois.map((p) => ({ name: p.name, categoryId: p.categoryId, pixelX: p.pixelX, pixelY: p.pixelY }))}
            categories={exportCategories.map((c) => ({ id: c.id, label: c.label, color: c.color }))}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-3 py-4">
                <s.icon className={cn("size-5 shrink-0", s.alert ? "text-destructive" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-2xl font-semibold leading-none", s.alert && "text-destructive")}>
                    {s.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Checklist ({doneCount}/{items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted"
                >
                  {item.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn(!item.done && "text-muted-foreground")}>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <EventDaysManager eventId={ev.id} eventSlug={eventSlug} days={days} />

      {canViewIncidents && <ActivityStatsChart data={activityStats} />}

      {access.isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SearchActivityChart data={searchActivity} />
          <TopSearchesCard eventId={ev.id} />
        </div>
      )}
    </div>
  );
}
