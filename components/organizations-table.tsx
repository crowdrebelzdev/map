"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  memberCount: number;
  eventCount: number;
};

export function OrganizationsTable({ organizations }: { organizations: OrganizationRow[] }) {
  const t = useTranslations("organizationsTable");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter(
      (o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q),
    );
  }, [organizations, query]);

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
              <TableHead>{tc("slug")}</TableHead>
              <TableHead>{tc("members")}</TableHead>
              <TableHead>{tc("events")}</TableHead>
              <TableHead>{tc("createdAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/organizations/${o.id}`} className="hover:underline">
                    {o.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{o.slug}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{o.memberCount}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{o.eventCount}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {o.createdAt.toLocaleDateString(locale === "en" ? "en-US" : "nl-NL")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
