"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Shapes } from "lucide-react";
import { toast } from "sonner";
import { createPoiCategory, updatePoiCategory, deletePoiCategory } from "@/actions/poi-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxEmpty,
  ComboboxItem,
} from "@/components/ui/combobox";
import { SaveAsTemplateButton } from "@/components/save-as-template-button";
import {
  POI_ICON_OPTIONS,
  getPoiIcon,
  getShapeContainerStyle,
  type PoiIconOption,
} from "@/lib/poi-icons";
import type { poiCategory, PoiExtraFieldDef, PoiExtraFieldType } from "@/db/schema";

type PoiCategoryRow = typeof poiCategory.$inferSelect;

const NO_ICON_VALUE = "__none__";
const EXTRA_FIELD_TYPES: { value: PoiExtraFieldType; label: string }[] = [
  { value: "text", label: "Tekst" },
  { value: "url", label: "Link" },
  { value: "phone", label: "Telefoonnummer" },
];

type IconComboboxOption = { value: string; label: string; Icon?: PoiIconOption["Icon"] };
const NO_ICON_OPTION: IconComboboxOption = { value: NO_ICON_VALUE, label: "Geen icoon" };
const ICON_COMBOBOX_OPTIONS: IconComboboxOption[] = [NO_ICON_OPTION, ...POI_ICON_OPTIONS];

function IconCombobox({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const selected =
    ICON_COMBOBOX_OPTIONS.find((o) => o.value === (value ?? NO_ICON_VALUE)) ?? NO_ICON_OPTION;
  return (
    <Combobox
      items={ICON_COMBOBOX_OPTIONS}
      value={selected}
      onValueChange={(opt: IconComboboxOption | null) =>
        onChange(opt && opt.value !== NO_ICON_VALUE ? opt.value : null)
      }
      itemToStringLabel={(opt: IconComboboxOption) => opt.label}
      filter={(opt: IconComboboxOption, query: string) =>
        opt.label.toLowerCase().includes(query.trim().toLowerCase())
      }
    >
      <ComboboxInput placeholder="Zoek icoon (of 'geen')..." className="h-8 text-xs" />
      <ComboboxContent className="max-h-72">
        <ComboboxEmpty>Geen iconen gevonden.</ComboboxEmpty>
        <ComboboxList>
          {(opt: IconComboboxOption) => (
            <ComboboxItem key={opt.value} value={opt}>
              <span className="flex items-center gap-2">
                {opt.Icon && <opt.Icon className="size-3.5" />}
                {opt.label}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function IconPreview({ color, icon }: { color: string; icon: string | null }) {
  const Icon = getPoiIcon(icon);
  return (
    <div style={getShapeContainerStyle("circle", color, 28)}>
      {Icon && <Icon className="size-3.5 text-white" />}
    </div>
  );
}

export function ExtraFieldsEditor({
  fields,
  onChange,
}: {
  fields: PoiExtraFieldDef[];
  onChange: (fields: PoiExtraFieldDef[]) => void;
}) {
  function updateField(index: number, patch: Partial<PoiExtraFieldDef>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }
  function addField() {
    onChange([...fields, { key: "", label: "", type: "text" }]);
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Extra velden</Label>
      {fields.map((field, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={field.label}
            onChange={(e) => {
              const label = e.target.value;
              updateField(i, {
                label,
                key: field.key || label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-"),
              });
            }}
            placeholder="Bijv. Telefoon"
            className="h-7 flex-1 text-xs"
          />
          <Select
            value={field.type}
            onValueChange={(v) => updateField(i, { type: (v ?? "text") as PoiExtraFieldType })}
          >
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXTRA_FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => removeField(i)}
          >
            <Trash2 />
            <span className="sr-only">Veld verwijderen</span>
          </Button>
        </div>
      ))}
      <Button variant="outline" size="xs" onClick={addField} className="gap-1">
        <Plus className="size-3" />
        Veld toevoegen
      </Button>
    </div>
  );
}

export function AutoNumberEditor({
  enabled,
  prefix,
  suffix,
  next,
  onChange,
}: {
  enabled: boolean;
  prefix: string;
  suffix: string;
  next: number;
  onChange: (patch: Partial<{ enabled: boolean; prefix: string; suffix: string; next: number }>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={enabled} onCheckedChange={(v) => onChange({ enabled: !!v })} />
        Automatisch nummeren
      </label>
      {enabled && (
        <div className="grid grid-cols-3 gap-1.5">
          <Input
            placeholder="Prefix"
            value={prefix}
            onChange={(e) => onChange({ prefix: e.target.value })}
            className="h-7 text-xs"
          />
          <Input
            type="number"
            min={1}
            placeholder="Volgnr."
            value={next}
            onChange={(e) => onChange({ next: Math.max(1, Number(e.target.value) || 1) })}
            className="h-7 text-xs"
          />
          <Input
            placeholder="Suffix"
            value={suffix}
            onChange={(e) => onChange({ suffix: e.target.value })}
            className="h-7 text-xs"
          />
        </div>
      )}
    </div>
  );
}

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
  const [icon, setIcon] = useState<string | null>(category.icon);
  const [extraFields, setExtraFields] = useState<PoiExtraFieldDef[]>(category.extraFields);
  const [autoNumberEnabled, setAutoNumberEnabled] = useState(category.autoNumberEnabled);
  const [autoNumberPrefix, setAutoNumberPrefix] = useState(category.autoNumberPrefix);
  const [autoNumberSuffix, setAutoNumberSuffix] = useState(category.autoNumberSuffix);
  const [autoNumberNext, setAutoNumberNext] = useState(category.autoNumberNext);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dirty =
    label !== category.label ||
    color !== category.color ||
    icon !== category.icon ||
    JSON.stringify(extraFields) !== JSON.stringify(category.extraFields) ||
    autoNumberEnabled !== category.autoNumberEnabled ||
    autoNumberPrefix !== category.autoNumberPrefix ||
    autoNumberSuffix !== category.autoNumberSuffix ||
    autoNumberNext !== category.autoNumberNext;

  function handleSave() {
    startTransition(async () => {
      try {
        await updatePoiCategory({
          eventId,
          eventSlug,
          categoryId: category.id,
          label,
          color,
          icon,
          extraFields,
          autoNumberEnabled,
          autoNumberPrefix,
          autoNumberSuffix,
          autoNumberNext,
        });
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
        setConfirmDeleteOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
      }
    });
  }

  return (
    <AccordionItem value={category.id} className="rounded-md border">
      <AccordionTrigger className="items-center gap-2 p-2 text-sm font-medium hover:no-underline">
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-white shadow"
          style={{ background: color }}
        />
        <span className="flex-1 truncate text-left">{label}</span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 border-t p-3">
        <Field>
          <FieldLabel htmlFor={`category-color-${category.id}`}>Kleur</FieldLabel>
          <input
            id={`category-color-${category.id}`}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-input p-0.5"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`category-name-${category.id}`}>Naam</FieldLabel>
          <Input
            id={`category-name-${category.id}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>Icoon</FieldLabel>
          <div className="flex items-center gap-2">
            <IconPreview color={color} icon={icon} />
            <div className="min-w-0 flex-1">
              <IconCombobox value={icon} onChange={setIcon} />
            </div>
          </div>
        </Field>
        <ExtraFieldsEditor fields={extraFields} onChange={setExtraFields} />
        <AutoNumberEditor
          enabled={autoNumberEnabled}
          prefix={autoNumberPrefix}
          suffix={autoNumberSuffix}
          next={autoNumberNext}
          onChange={(patch) => {
            if (patch.enabled !== undefined) setAutoNumberEnabled(patch.enabled);
            if (patch.prefix !== undefined) setAutoNumberPrefix(patch.prefix);
            if (patch.suffix !== undefined) setAutoNumberSuffix(patch.suffix);
            if (patch.next !== undefined) setAutoNumberNext(patch.next);
          }}
        />
        <div className="flex items-center gap-2 pt-1">
          <Button onClick={handleSave} disabled={!dirty || isPending} className="flex-1">
            Opslaan
          </Button>
          <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 text-destructive hover:bg-destructive/10"
                  disabled={isPending}
                />
              }
            >
              <Trash2 />
              <span className="sr-only">Verwijderen</span>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Categorie verwijderen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Weet je zeker dat je &quot;{label}&quot; wilt verwijderen? Dit kan alleen als er geen
                  POI&apos;s meer aan deze categorie hangen, en kan niet ongedaan worden gemaakt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Annuleren</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isPending}>
                  {isPending ? "Bezig..." : "Verwijderen"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </AccordionContent>
    </AccordionItem>
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
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [newExtraFields, setNewExtraFields] = useState<PoiExtraFieldDef[]>([]);
  const [newAutoNumberEnabled, setNewAutoNumberEnabled] = useState(false);
  const [newAutoNumberPrefix, setNewAutoNumberPrefix] = useState("");
  const [newAutoNumberSuffix, setNewAutoNumberSuffix] = useState("");
  const [newAutoNumberNext, setNewAutoNumberNext] = useState(1);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!newLabel.trim()) return;
    startTransition(async () => {
      try {
        await createPoiCategory({
          eventId,
          eventSlug,
          label: newLabel,
          color: newColor,
          icon: newIcon,
          extraFields: newExtraFields,
          autoNumberEnabled: newAutoNumberEnabled,
          autoNumberPrefix: newAutoNumberPrefix,
          autoNumberSuffix: newAutoNumberSuffix,
          autoNumberNext: newAutoNumberNext,
        });
        toast.success("Categorie toegevoegd.");
        setNewLabel("");
        setNewIcon(null);
        setNewExtraFields([]);
        setNewAutoNumberEnabled(false);
        setNewAutoNumberPrefix("");
        setNewAutoNumberSuffix("");
        setNewAutoNumberNext(1);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Aanmaken mislukt.");
      }
    });
  }

  const sortedCategories = [...categories].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Categorieën ({categories.length})</CardTitle>
          <SaveAsTemplateButton eventId={eventId} />
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Shapes />
                </EmptyMedia>
                <EmptyTitle>Nog geen categorieën</EmptyTitle>
                <EmptyDescription>
                  Maak hieronder je eerste categorie aan om POI&apos;s te kunnen indelen.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Accordion multiple className="gap-2">
              {sortedCategories.map((c) => (
                <CategoryRow key={c.id} eventId={eventId} eventSlug={eventSlug} category={c} />
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nieuwe categorie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="new-category-color">Kleur</FieldLabel>
            <input
              id="new-category-color"
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-md border border-input p-0.5"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-category-label">Naam</FieldLabel>
            <Input
              id="new-category-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Bijv. Kassa's"
            />
          </Field>
          <Field>
            <FieldLabel>Icoon</FieldLabel>
            <div className="flex items-center gap-2">
              <IconPreview color={newColor} icon={newIcon} />
              <div className="min-w-0 flex-1">
                <IconCombobox value={newIcon} onChange={setNewIcon} />
              </div>
            </div>
          </Field>
          <ExtraFieldsEditor fields={newExtraFields} onChange={setNewExtraFields} />
          <AutoNumberEditor
            enabled={newAutoNumberEnabled}
            prefix={newAutoNumberPrefix}
            suffix={newAutoNumberSuffix}
            next={newAutoNumberNext}
            onChange={(patch) => {
              if (patch.enabled !== undefined) setNewAutoNumberEnabled(patch.enabled);
              if (patch.prefix !== undefined) setNewAutoNumberPrefix(patch.prefix);
              if (patch.suffix !== undefined) setNewAutoNumberSuffix(patch.suffix);
              if (patch.next !== undefined) setNewAutoNumberNext(patch.next);
            }}
          />
          <Button onClick={handleCreate} disabled={!newLabel.trim() || isPending} className="w-full">
            Toevoegen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
