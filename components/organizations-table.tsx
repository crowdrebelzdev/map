"use client";

import { useMemo, useState } from "react";
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
          placeholder="Filter op naam of slug..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen organisaties gevonden.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Leden</TableHead>
              <TableHead>Evenementen</TableHead>
              <TableHead>Aangemaakt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-muted-foreground">{o.slug}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{o.memberCount}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{o.eventCount}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {o.createdAt.toLocaleDateString("nl-NL")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
