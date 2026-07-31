"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { ArchiveEventButton } from "@/components/archive-event-button";
import { DeleteEventButton } from "@/components/delete-event-button";
import { DuplicateEventButton } from "@/components/duplicate-event-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EventRow = { id: string; name: string; slug: string; archivedAt: Date | null };

export function EventsTable({ events, isAdmin }: { events: EventRow[]; isAdmin: boolean }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) => e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q),
    );
  }, [events, query]);

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
        <p className="text-sm text-muted-foreground">Geen evenementen gevonden.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className={cn(e.archivedAt && "opacity-60")}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {e.name}
                    {e.archivedAt && <Badge variant="secondary">Gearchiveerd</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.slug}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/org/events/${e.slug}/map`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Beheren
                    </Link>
                    {isAdmin && <DuplicateEventButton eventId={e.id} eventName={e.name} />}
                    {isAdmin && (
                      <ArchiveEventButton
                        eventId={e.id}
                        eventName={e.name}
                        archived={!!e.archivedAt}
                      />
                    )}
                    {isAdmin && <DeleteEventButton eventId={e.id} eventName={e.name} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
