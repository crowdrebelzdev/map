"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type EventRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  archivedAt: Date | null;
  organizationId: string;
  organizationName: string;
};

export function PlatformEventsTable({ events }: { events: EventRow[] }) {
  const t = useTranslations("platformEventsTable");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) => e.name.toLowerCase().includes(q) || e.organizationName.toLowerCase().includes(q),
    );
  }, [events, query]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("filterPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tc("name")}</TableHead>
              <TableHead>{t("organization")}</TableHead>
              <TableHead>{tc("createdAt")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className={cn(e.archivedAt && "opacity-60")}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {e.name}
                    {e.archivedAt && <Badge variant="secondary">{tc("archived")}</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/organizations/${e.organizationId}`} className="hover:underline">
                    {e.organizationName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {e.createdAt.toLocaleDateString(locale === "en" ? "en-US" : "nl-NL")}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/org/events/${e.slug}/map`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {tc("manage")}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
