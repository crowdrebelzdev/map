import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { eventMap, gridConfig, poi, poiCategory, eventMember, eventDay } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventDaysManager } from "@/components/event-days-manager";

export default async function EventOverviewPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);

  const [map, grid, [{ value: categoryCount }], [{ value: poiCount }], [{ value: memberCount }], days] =
    await Promise.all([
      db.query.eventMap.findFirst({ where: eq(eventMap.eventId, ev.id) }),
      db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, ev.id) }),
      db.select({ value: count() }).from(poiCategory).where(eq(poiCategory.eventId, ev.id)),
      db.select({ value: count() }).from(poi).where(eq(poi.eventId, ev.id)),
      db.select({ value: count() }).from(eventMember).where(eq(eventMember.eventId, ev.id)),
      db.query.eventDay.findMany({ where: eq(eventDay.eventId, ev.id), orderBy: asc(eventDay.date) }),
    ]);

  const items = [
    {
      label: "Plattegrond geüpload en ankerpunten ingesteld",
      done: !!map,
      href: `/admin/events/${eventSlug}/map`,
    },
    {
      label: "Grid ingesteld",
      done: !!grid,
      href: `/admin/events/${eventSlug}/map`,
    },
    {
      label: "Categorieën aangemaakt",
      done: categoryCount > 0,
      href: `/admin/events/${eventSlug}/categories`,
    },
    {
      label: "POI's geplaatst",
      done: poiCount > 0,
      href: `/admin/events/${eventSlug}/pois`,
    },
    {
      label: "Team toegewezen",
      done: memberCount > 0,
      href: `/admin/events/${eventSlug}/team`,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-4">
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
    </div>
  );
}
