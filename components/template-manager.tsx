"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  createEmptyTemplate,
  deleteEventTemplate,
  addTemplateCategory,
  updateTemplateCategory,
  deleteTemplateCategory,
} from "@/actions/event-templates";
import type { eventTemplate, eventTemplateCategory } from "@/db/schema";

type TemplateRow = typeof eventTemplate.$inferSelect;
type TemplateCategoryRow = typeof eventTemplateCategory.$inferSelect;
type TemplateWithCategories = TemplateRow & { categories: TemplateCategoryRow[] };

const DEFAULT_COLOR = "#2563eb";

function slugifyKey(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function CategoryRow({ templateId, category }: { templateId: string; category: TemplateCategoryRow }) {
  const router = useRouter();
  const [label, setLabel] = useState(category.label);
  const [color, setColor] = useState(category.color);
  const [saving, setSaving] = useState(false);

  const dirty = label !== category.label || color !== category.color;

  async function handleSave() {
    setSaving(true);
    try {
      await updateTemplateCategory(templateId, category.id, { label, color });
      toast.success("Categorie bijgewerkt.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteTemplateCategory(templateId, category.id);
      toast.success("Categorie verwijderd.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-7 w-8 shrink-0 cursor-pointer rounded border p-0.5"
      />
      <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 flex-1 text-sm" />
      {dirty && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "..." : "Opslaan"}
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" size="icon-sm" />}>
          <Trash2 className="size-3.5" />
          <span className="sr-only">Verwijderen</span>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Categorie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{category.label}&quot; wordt uit dit sjabloon verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateCard({ template }: { template: TemplateWithCategories }) {
  const router = useRouter();
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [adding, setAdding] = useState(false);

  async function handleAddCategory() {
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      await addTemplateCategory(template.id, {
        key: slugifyKey(newLabel) || `cat-${Date.now()}`,
        label: newLabel,
        color: newColor,
      });
      setNewLabel("");
      setNewColor(DEFAULT_COLOR);
      toast.success("Categorie toegevoegd.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toevoegen mislukt.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteTemplate() {
    try {
      await deleteEventTemplate(template.id);
      toast.success("Sjabloon verwijderd.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle>{template.name}</CardTitle>
          <Badge variant="secondary">{template.categories.length}</Badge>
        </div>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="icon-sm" />}>
            <Trash2 className="size-3.5" />
            <span className="sr-only">Sjabloon verwijderen</span>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sjabloon verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                &quot;{template.name}&quot; en al zijn categorieën worden verwijderd. Dit kan niet
                ongedaan worden gemaakt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDeleteTemplate}>
                Verwijderen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {template.categories.length === 0 && (
          <p className="text-xs text-muted-foreground">Nog geen categorieën in dit sjabloon.</p>
        )}
        {template.categories.map((c) => (
          <CategoryRow key={c.id} templateId={template.id} category={c} />
        ))}

        <div className="flex items-center gap-2 border-t pt-2">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-7 w-8 shrink-0 cursor-pointer rounded border p-0.5"
          />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nieuwe categorie..."
            className="h-8 flex-1 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
          />
          <Button size="sm" onClick={handleAddCategory} disabled={adding || !newLabel.trim()}>
            <Plus className="size-3.5" />
            Toevoegen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TemplateManager({ templates }: { templates: TemplateWithCategories[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createEmptyTemplate(name);
      setName("");
      toast.success("Sjabloon aangemaakt.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aanmaken mislukt.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Nieuw sjabloon</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="template-name">Naam</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bv. Standaard beveiligingsevenement"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={creating || !name.trim()}>
                Aanmaken
              </Button>
            </div>
          </Field>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plus />
            </EmptyMedia>
            <EmptyTitle>Nog geen sjablonen</EmptyTitle>
            <EmptyDescription>
              Maak hierboven een sjabloon aan, of sla een bestaand event op als sjabloon vanuit de
              POI-categorieën van dat event.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        templates.map((t) => <TemplateCard key={t.id} template={t} />)
      )}
    </div>
  );
}
