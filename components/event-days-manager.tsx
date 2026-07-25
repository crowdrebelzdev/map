"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createEventDay, deleteEventDay } from "@/actions/event-days";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EventDayRow = { id: string; date: string; label: string | null };

export function EventDaysManager({
  eventId,
  eventSlug,
  days,
}: {
  eventId: string;
  eventSlug: string;
  days: EventDayRow[];
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!date) return;
    startTransition(async () => {
      try {
        await createEventDay({ eventId, eventSlug, date, label });
        toast.success("Dag toegevoegd.");
        setDate("");
        setLabel("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Toevoegen mislukt.");
      }
    });
  }

  function handleDelete(dayId: string) {
    startTransition(async () => {
      try {
        await deleteEventDay(eventId, eventSlug, dayId);
        toast.success("Dag verwijderd.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dagen ({days.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Voor meerdaagse evenementen. Zonder dagen is dit evenement gewoon eendaags — POI&apos;s
          zonder dag zijn dan altijd zichtbaar.
        </p>
        {days.length > 0 && (
          <ul className="space-y-1.5">
            {days.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">
                  {d.date}
                  {d.label ? ` — ${d.label}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(d.id)}
                  disabled={isPending}
                >
                  <Trash2 />
                  <span className="sr-only">Verwijderen</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="day-date">Datum</Label>
            <Input id="day-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="day-label">Label (optioneel)</Label>
            <Input
              id="day-label"
              placeholder="bv. Dag 1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={!date || isPending}>
            Toevoegen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
