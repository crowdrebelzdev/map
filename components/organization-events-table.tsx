"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type EventRow = { id: string; name: string; slug: string; createdAt: Date; archivedAt: Date | null };

export function OrganizationEventsTable({ events }: { events: EventRow[] }) {
  const t = useTranslations("organizationEventsTable");
  const tc = useTranslations("common");
  const locale = useLocale();
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noEvents")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tc("name")}</TableHead>
          <TableHead>{tc("slug")}</TableHead>
          <TableHead>{tc("createdAt")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id} className={cn(e.archivedAt && "opacity-60")}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {e.name}
                {e.archivedAt && <Badge variant="secondary">{tc("archived")}</Badge>}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{e.slug}</TableCell>
            <TableCell className="text-muted-foreground">
              {e.createdAt.toLocaleDateString(locale === "en" ? "en-US" : "nl-NL")}
            </TableCell>
            <TableCell className="text-right">
              <Link href={`/org/events/${e.slug}/map`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {tc("manage")}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
