"use client";

import { useState } from "react";
import { AlertTriangle, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { createIncident } from "@/actions/incidents";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { LatLng } from "@/lib/geo";

const CATEGORY_OPTIONS = [
  { value: "medical", label: "Medisch" },
  { value: "security", label: "Veiligheid" },
  { value: "technical", label: "Technisch" },
  { value: "other", label: "Overig" },
];

export function IncidentControls({
  eventId,
  eventSlug,
  position,
}: {
  eventId: string;
  eventSlug: string;
  position: LatLng | null;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sosSending, setSosSending] = useState(false);

  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!position || !description.trim()) return;
    setSending(true);
    try {
      await createIncident({
        eventId,
        eventSlug,
        type: "incident",
        category,
        description,
        lat: position.lat,
        lng: position.lng,
      });
      toast.success("Melding verstuurd.");
      setDescription("");
      setCategory("other");
      setReportOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Versturen mislukt.");
    } finally {
      setSending(false);
    }
  }

  async function handleSosConfirm() {
    if (!position) return;
    setSosSending(true);
    try {
      await createIncident({ eventId, eventSlug, type: "sos", lat: position.lat, lng: position.lng });
      toast.success("SOS verstuurd — het command center is gewaarschuwd.");
      setSosOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "SOS versturen mislukt.");
    } finally {
      setSosSending(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-24 left-3 z-20 flex flex-col items-start gap-2">
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogTrigger
          render={
            <Button variant="secondary" size="sm" className="pointer-events-auto shadow-md" disabled={!position} />
          }
        >
          <MessageSquarePlus size={14} />
          Melding
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Melding maken</DialogTitle>
            <DialogDescription>Wordt verstuurd met je huidige locatie.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReportSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="incident-category">Type</Label>
              <Select value={category} onValueChange={(v) => setCategory(v ?? "other")}>
                <SelectTrigger id="incident-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="incident-description">Beschrijving</Label>
              <Textarea
                id="incident-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setReportOpen(false)} disabled={sending}>
                Annuleren
              </Button>
              <Button type="submit" disabled={sending || !description.trim()}>
                {sending ? "Bezig..." : "Versturen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sosOpen} onOpenChange={setSosOpen}>
        <DialogTrigger
          render={
            <Button variant="destructive" size="sm" className="pointer-events-auto shadow-md" disabled={!position} />
          }
        >
          <AlertTriangle size={14} />
          SOS
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SOS versturen?</DialogTitle>
            <DialogDescription>
              Dit stuurt direct een urgente melding met je huidige locatie naar het command center.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSosOpen(false)} disabled={sosSending}>
              Annuleren
            </Button>
            <Button variant="destructive" onClick={handleSosConfirm} disabled={sosSending}>
              {sosSending ? "Bezig..." : "Ja, verstuur SOS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
