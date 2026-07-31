"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { renameOrganization } from "@/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RenameOrganizationForm({
  organizationId,
  currentName,
}: {
  organizationId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      await renameOrganization(organizationId, name);
      toast.success("Organisatie hernoemd.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hernoemen mislukt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setName(currentName); }}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil />
        Hernoemen
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Organisatie hernoemen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="org-rename">Naam</Label>
            <Input id="org-rename" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={saving}>
              Annuleren
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Bezig..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
