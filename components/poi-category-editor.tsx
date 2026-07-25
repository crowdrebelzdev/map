"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createPoiCategory, updatePoiCategory, deletePoiCategory } from "@/actions/poi-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SaveAsTemplateButton } from "@/components/save-as-template-button";
import type { poiCategory } from "@/db/schema";

type PoiCategoryRow = typeof poiCategory.$inferSelect;

function CategoryRow({
  eventId,
  eventSlug,
  category,
}: {
  eventId: string;
  eventSlug: string;
  category: PoiCategoryRow;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(category.label);
  const [color, setColor] = useState(category.color);
  const [isPending, startTransition] = useTransition();
  const dirty = label !== category.label || color !== category.color;

  function handleSave() {
    startTransition(async () => {
      try {
        await updatePoiCategory({ eventId, eventSlug, categoryId: category.id, label, color });
        toast.success("Categorie opgeslagen.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deletePoiCategory(eventId, eventSlug, category.id);
        toast.success("Categorie verwijderd.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
      />
      <Input value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1" />
      <Button variant="outline" size="sm" onClick={handleSave} disabled={!dirty || isPending}>
        Opslaan
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:bg-destructive/10"
        onClick={handleDelete}
        disabled={isPending}
      >
        <Trash2 />
        <span className="sr-only">Verwijderen</span>
      </Button>
    </div>
  );
}

export function PoiCategoryEditor({
  eventId,
  eventSlug,
  categories,
}: {
  eventId: string;
  eventSlug: string;
  categories: PoiCategoryRow[];
}) {
  const router = useRouter();
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#2563eb");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!newLabel.trim()) return;
    startTransition(async () => {
      try {
        await createPoiCategory({ eventId, eventSlug, label: newLabel, color: newColor });
        toast.success("Categorie toegevoegd.");
        setNewLabel("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Aanmaken mislukt.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Categorieën ({categories.length})</CardTitle>
          <SaveAsTemplateButton eventId={eventId} />
        </CardHeader>
        <CardContent className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">Nog geen categorieën.</p>
          )}
          {categories.map((c) => (
            <CategoryRow key={c.id} eventId={eventId} eventSlug={eventSlug} category={c} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nieuwe categorie</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-2">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
          />
          <div className="flex-1 space-y-1">
            <Label htmlFor="new-category-label">Naam</Label>
            <Input
              id="new-category-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Bijv. Kassa's"
            />
          </div>
          <Button onClick={handleCreate} disabled={!newLabel.trim() || isPending}>
            Toevoegen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
