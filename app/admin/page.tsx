import Link from "next/link";
import { count } from "drizzle-orm";
import { Building2, CalendarDays, Users as UsersIcon } from "lucide-react";
import { db } from "@/db";
import { organization, event, user } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function PlatformAdminDashboardPage() {
  const [[orgCount], [userCount], [eventCount]] = await Promise.all([
    db.select({ value: count() }).from(organization),
    db.select({ value: count() }).from(user),
    db.select({ value: count() }).from(event),
  ]);

  const stats = [
    { label: "Organisaties", value: orgCount.value, icon: Building2, href: "/admin/organizations" },
    { label: "Gebruikers", value: userCount.value, icon: UsersIcon, href: "/admin/users" },
    { label: "Evenementen totaal", value: eventCount.value, icon: CalendarDays, href: null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platformbeheer</h1>
        <p className="text-sm text-muted-foreground">
          Overzicht over alle organisaties en gebruikers heen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const tile = (
            <Card className={s.href ? "transition-colors hover:bg-muted/50" : undefined}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>{s.label}</CardDescription>
                <s.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-3xl">{s.value}</CardTitle>
              </CardContent>
            </Card>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {tile}
            </Link>
          ) : (
            <div key={s.label}>{tile}</div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Snel naar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/admin/organizations" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Organisaties beheren
          </Link>
          <Link href="/admin/users" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Gebruikers beheren
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
