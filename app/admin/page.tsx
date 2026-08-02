import Link from "next/link";
import { count } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Building2, CalendarDays, Users as UsersIcon } from "lucide-react";
import { db } from "@/db";
import { organization, event, user } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function PlatformAdminDashboardPage() {
  const t = await getTranslations("platformDashboard");
  const [[orgCount], [userCount], [eventCount]] = await Promise.all([
    db.select({ value: count() }).from(organization),
    db.select({ value: count() }).from(user),
    db.select({ value: count() }).from(event),
  ]);

  const stats = [
    { label: t("statsOrganizations"), value: orgCount.value, icon: Building2, href: "/admin/organizations" },
    { label: t("statsUsers"), value: userCount.value, icon: UsersIcon, href: "/admin/users" },
    { label: t("statsEventsTotal"), value: eventCount.value, icon: CalendarDays, href: null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
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
          <CardTitle>{t("quickLinks")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/admin/organizations" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("manageOrganizations")}
          </Link>
          <Link href="/admin/users" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("manageUsers")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
