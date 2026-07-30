"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Siren } from "lucide-react";
import { toast } from "sonner";
import { listIncidents, resolveIncident } from "@/actions/incidents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type IncidentRow = Awaited<ReturnType<typeof listIncidents>>[number];

const POLL_INTERVAL_MS = 10_000;

const CATEGORY_LABELS: Record<string, string> = {
  medical: "Medisch",
  security: "Veiligheid",
  technical: "Technisch",
  other: "Overig",
};

function formatTime(d: Date) {
  return new Date(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export function IncidentsSheet({
  eventId,
  eventSlug,
  initialIncidents,
}: {
  eventId: string;
  eventSlug: string;
  initialIncidents: IncidentRow[];
}) {
  const [incidents, setIncidents] = useState(initialIncidents);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        setIncidents(await listIncidents(eventId));
      } catch {
        // Best-effort polling — a transient failure just skips this refresh.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [eventId]);

  async function handleResolve(incidentId: string) {
    setResolvingId(incidentId);
    try {
      await resolveIncident(eventId, eventSlug, incidentId);
      setIncidents((prev) =>
        prev.map((i) => (i.id === incidentId ? { ...i, status: "resolved" as const } : i)),
      );
      toast.success("Melding afgehandeld.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Afhandelen mislukt.");
    } finally {
      setResolvingId(null);
    }
  }

  const openCount = incidents.filter((i) => i.status === "open").length;
  const hasOpenSos = incidents.some((i) => i.type === "sos" && i.status === "open");

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant={hasOpenSos ? "destructive" : "secondary"} size="sm" className="gap-1.5" />
        }
      >
        {hasOpenSos ? <Siren size={15} /> : <AlertTriangle size={15} />}
        Meldingen
        {openCount > 0 && (
          <Badge variant={hasOpenSos ? "destructive" : "secondary"} className="ml-0.5">
            {openCount}
          </Badge>
        )}
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Meldingen</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {incidents.length === 0 && (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertTriangle />
                </EmptyMedia>
                <EmptyTitle>Nog geen meldingen</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          {incidents.map((i) => (
            <div
              key={i.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-md border p-2.5",
                i.type === "sos" && i.status === "open" && "border-destructive bg-destructive/5",
              )}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  {i.type === "sos" && <AlertTriangle size={14} className="text-destructive" />}
                  <span className="text-sm font-medium">
                    {i.type === "sos" ? "SOS" : (CATEGORY_LABELS[i.category ?? "other"] ?? "Melding")}
                  </span>
                  <Badge variant={i.status === "open" ? "secondary" : "outline"}>
                    {i.status === "open" ? "Open" : "Afgehandeld"}
                  </Badge>
                </div>
                {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {i.reporterName} · {formatTime(i.createdAt)}
                </p>
              </div>
              {i.status === "open" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleResolve(i.id)}
                  disabled={resolvingId === i.id}
                >
                  Afhandelen
                </Button>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
