"use client";

import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { saveEventAsTemplate } from "@/actions/event-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SaveAsTemplateButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveEventAsTemplate(eventId, name);
      toast.success("Sjabloon opgeslagen.");
      setName("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <BookmarkPlus />
        Als sjabloon opslaan
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Als sjabloon opslaan</DialogTitle>
          <DialogDescription>
            Slaat de huidige POI-categorieën op als sjabloon voor nieuwe evenementen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="template-name">Naam van het sjabloon</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bijv. Standaard festival"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Bezig..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
