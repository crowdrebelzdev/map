import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { getTopSearches } from "@/actions/search-log";

/** Server component: reads the aggregated `searchLog` table directly (see
 * `getTopSearches`) — surfaces terms people search for on the live/public map, which can
 * point at a POI that's hard to find or missing a name people expect. */
export async function TopSearchesCard({ eventId }: { eventId: string }) {
  const topSearches = await getTopSearches(eventId, { limit: 10 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meest gezocht</CardTitle>
      </CardHeader>
      <CardContent>
        {topSearches.length === 0 ? (
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>Nog geen zoekopdrachten</EmptyTitle>
              <EmptyDescription>
                Verschijnt hier zodra bezoekers op de kaart iets opzoeken.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-1.5">
            {topSearches.map((s) => (
              <li key={`${s.type}-${s.term}`} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{s.type === "grid" ? "Grid" : "POI"}</Badge>
                  {s.term}
                </span>
                <span className="text-muted-foreground">{s.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
