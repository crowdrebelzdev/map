"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listActivity } from "@/actions/activity-log";

type ActivityRow = { id: string; action: string; summary: string; createdAt: Date };

const PAGE_SIZE = 30;

// Groups the free-text `action` strings written by `logActivity(...)` call sites (see
// actions/poi.ts, areas.ts, poi-categories.ts, area-categories.ts, grid.ts, map.ts,
// event-members.ts) into the filter dropdown below.
const ACTION_GROUPS: { prefix: string; label: string }[] = [
  { prefix: "poi.", label: "POI's" },
  { prefix: "area.", label: "Areas" },
  { prefix: "category.", label: "Categorieën" },
  { prefix: "grid.", label: "Grid" },
  { prefix: "map.", label: "Kaart" },
  { prefix: "team.", label: "Team" },
];

function formatDate(d: Date) {
  return new Date(d).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

export function ActivityLogView({
  eventId,
  entries: initialEntries,
}: {
  eventId: string;
  entries: ActivityRow[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [actionPrefix, setActionPrefix] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialEntries.length === PAGE_SIZE);

  async function reload(nextPrefix: string, nextSearch: string) {
    setLoading(true);
    try {
      const rows = await listActivity(eventId, {
        actionPrefix: nextPrefix || undefined,
        search: nextSearch || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setEntries(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    setLoading(true);
    try {
      const rows = await listActivity(eventId, {
        actionPrefix: actionPrefix || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: entries.length,
      });
      setEntries((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Activiteit</CardTitle>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => reload(actionPrefix, search)}
            onKeyDown={(e) => e.key === "Enter" && reload(actionPrefix, search)}
            className="h-8 w-40 text-xs"
          />
          <Select
            value={actionPrefix || "__all__"}
            onValueChange={(v) => {
              if (!v) return;
              const next = v === "__all__" ? "" : v;
              setActionPrefix(next);
              reload(next, search);
            }}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue>
                {(v: string) => ACTION_GROUPS.find((g) => g.prefix === v)?.label ?? "Alles"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alles</SelectItem>
              {ACTION_GROUPS.map((g) => (
                <SelectItem key={g.prefix} value={g.prefix}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History />
              </EmptyMedia>
              <EmptyTitle>Geen activiteit gevonden</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ul className="space-y-2">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span>{e.summary}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(e.createdAt)}</span>
                </li>
              ))}
            </ul>
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={loadMore}
                disabled={loading}
              >
                {loading ? "Bezig..." : "Meer laden"}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
