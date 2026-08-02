import Link from "next/link";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { CalendarDays, MapPin, Radio, Users as UsersIcon } from "lucide-react";
import { db } from "@/db";
import { event, poi, member, liveLocation } from "@/db/schema";
import { requireActiveOrganizationId } from "@/lib/org-access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LIVE_STALE_MS = 3 * 60 * 1000;

export default async function AdminDashboardPage() {
  const t = await getTranslations("orgDashboard");
  const { organizationId } = await requireActiveOrganizationId();
  const orgEvent = and(eq(event.organizationId, organizationId), isNull(event.archivedAt));
  // Server Component: runs once per request, not subject to the re-render/memoization
  // concerns this rule protects client components from.
  // eslint-disable-next-line react-hooks/purity
  const liveSince = new Date(Date.now() - LIVE_STALE_MS);

  const [[eventCount], [userCount], [poiCount], [liveCount], recentEvents] = await Promise.all([
    db.select({ value: count() }).from(event).where(orgEvent),
    db.select({ value: count() }).from(member).where(eq(member.organizationId, organizationId)),
    db.select({ value: count() }).from(poi).innerJoin(event, eq(poi.eventId, event.id)).where(orgEvent),
    db
      .select({ value: count() })
      .from(liveLocation)
      .innerJoin(event, eq(liveLocation.eventId, event.id))
      .where(and(orgEvent, gt(liveLocation.updatedAt, liveSince))),
    db.query.event.findMany({ where: orgEvent, orderBy: desc(event.createdAt), limit: 5 }),
  ]);

  const stats = [
    { label: t("statsEvents"), value: eventCount.value, icon: CalendarDays },
    { label: t("statsUsers"), value: userCount.value, icon: UsersIcon },
    { label: t("statsPois"), value: poiCount.value, icon: MapPin },
    { label: t("statsActiveNow"), value: liveCount.value, icon: Radio },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>{s.label}</CardDescription>
              <s.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("recentEvents")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colSlug")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">{e.slug}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/org/events/${e.slug}/map`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {t("manage")}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
