import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ActivityRow = { id: string; action: string; summary: string; createdAt: Date };

function formatDate(d: Date) {
  return new Date(d).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

export function ActivityLogView({ entries }: { entries: ActivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activiteit</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen activiteit voor dit evenement.</p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}
