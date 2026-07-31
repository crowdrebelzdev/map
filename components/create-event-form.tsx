"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createEvent } from "@/actions/events";
import { deleteEventTemplate } from "@/actions/event-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const NO_TEMPLATE_VALUE = "__none__";

export function CreateEventForm({
  templates = [],
}: {
  templates?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(NO_TEMPLATE_VALUE);
  const [isPending, startTransition] = useTransition();
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false);

  async function handleDeleteTemplate() {
    if (templateId === NO_TEMPLATE_VALUE) return;
    setDeletingTemplate(true);
    try {
      await deleteEventTemplate(templateId);
      toast.success("Sjabloon verwijderd.");
      setTemplateId(NO_TEMPLATE_VALUE);
      setConfirmDeleteTemplate(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setDeletingTemplate(false);
    }
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const created = await createEvent(formData);
        toast.success(`"${created.name}" aangemaakt.`);
        setOpen(false);
        setTemplateId(NO_TEMPLATE_VALUE);
        router.push(`/org/events/${created.slug}/map`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Aanmaken mislukt.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Nieuw evenement
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuw evenement</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Naam</Label>
            <Input id="name" name="name" placeholder="Bijv. Zomerfestival 2026" required />
          </div>
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="templateId">Sjabloon (optioneel)</Label>
              <input type="hidden" name="templateId" value={templateId === NO_TEMPLATE_VALUE ? "" : templateId} />
              <div className="flex gap-2">
                <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? NO_TEMPLATE_VALUE)}>
                  <SelectTrigger id="templateId" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE_VALUE}>Geen — standaardcategorieën</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templateId !== NO_TEMPLATE_VALUE && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDeleteTemplate(true)}
                    disabled={deletingTemplate}
                  >
                    <Trash2 />
                    <span className="sr-only">Sjabloon verwijderen</span>
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Neemt de POI-categorieën van het sjabloon over.
              </p>
              <AlertDialog open={confirmDeleteTemplate} onOpenChange={setConfirmDeleteTemplate}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sjabloon verwijderen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Weet je zeker dat je &quot;
                      {templates.find((t) => t.id === templateId)?.name}&quot; wilt verwijderen? Dit kan
                      niet ongedaan worden gemaakt.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletingTemplate}>Annuleren</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDeleteTemplate}
                      disabled={deletingTemplate}
                    >
                      {deletingTemplate ? "Bezig..." : "Verwijderen"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={isPending}>
              Annuleren
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Bezig..." : "Aanmaken"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
