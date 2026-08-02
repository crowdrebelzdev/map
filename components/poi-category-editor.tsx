"use client";

import { createElement, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

type IconComboboxOption = { value: string; label: string; Icon?: PoiIconOption["Icon"] };

function IconCombobox({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations("poiCategoryEditor");
  const noIconOption: IconComboboxOption = { value: NO_ICON_VALUE, label: t("noIconOption") };
  const options: IconComboboxOption[] = [noIconOption, ...POI_ICON_OPTIONS];
  const selected = options.find((o) => o.value === (value ?? NO_ICON_VALUE)) ?? noIconOption;
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(opt: IconComboboxOption | null) =>
        onChange(opt && opt.value !== NO_ICON_VALUE ? opt.value : null)
      }
      itemToStringLabel={(opt: IconComboboxOption) => opt.label}
      filter={(opt: IconComboboxOption, query: string) =>
        opt.label.toLowerCase().includes(query.trim().toLowerCase())
      }
    >
      <ComboboxInput placeholder={t("iconSearchPlaceholder")} className="h-8 text-xs" />
      <ComboboxContent className="max-h-72">
        <ComboboxEmpty>{t("noIconsFound")}</ComboboxEmpty>
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
  // getPoiIcon looks up a stable, module-level Lucide icon constant — not a fresh
  // component definition per render — but its return type still reads as "a component
  // created during render" to the compiler when used as a JSX tag. createElement sidesteps
  // that heuristic; functionally identical to `<Icon className="..." />`.
  const Icon = getPoiIcon(icon);
  return (
    <div style={getShapeContainerStyle("circle", color, 28)}>
      {Icon && createElement(Icon, { className: "size-3.5 text-white" })}
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
  const t = useTranslations("poiCategoryEditor");
  const extraFieldTypes: { value: PoiExtraFieldType; label: string }[] = [
    { value: "text", label: t("extraFieldTypeText") },
    { value: "url", label: t("extraFieldTypeUrl") },
    { value: "phone", label: t("extraFieldTypePhone") },
  ];

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
      <Label className="text-xs text-muted-foreground">{t("extraFieldsLabel")}</Label>
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
            placeholder={t("extraFieldNamePlaceholder")}
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
              {extraFieldTypes.map((ft) => (
                <SelectItem key={ft.value} value={ft.value}>
                  {ft.label}
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
            <span className="sr-only">{t("removeFieldSr")}</span>
          </Button>
        </div>
      ))}
      <Button variant="outline" size="xs" onClick={addField} className="gap-1">
        <Plus className="size-3" />
        {t("addField")}
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
  const t = useTranslations("poiCategoryEditor");
  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={enabled} onCheckedChange={(v) => onChange({ enabled: !!v })} />
        {t("autoNumberLabel")}
      </label>
      {enabled && (
        <div className="grid grid-cols-3 gap-1.5">
          <Input
            placeholder={t("prefixPlaceholder")}
            value={prefix}
            onChange={(e) => onChange({ prefix: e.target.value })}
            className="h-7 text-xs"
          />
          <Input
            type="number"
            min={1}
            placeholder={t("nextPlaceholder")}
            value={next}
            onChange={(e) => onChange({ next: Math.max(1, Number(e.target.value) || 1) })}
            className="h-7 text-xs"
          />
          <Input
            placeholder={t("suffixPlaceholder")}
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
  const t = useTranslations("poiCategoryEditor");
  const tc = useTranslations("common");
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
        toast.success(t("categorySavedToast"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("saveErrorFallback"));
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deletePoiCategory(eventId, eventSlug, category.id);
        toast.success(t("categoryDeletedToast"));
        setConfirmDeleteOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("deleteErrorFallback"));
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
          <FieldLabel htmlFor={`category-color-${category.id}`}>{tc("color")}</FieldLabel>
          <input
            id={`category-color-${category.id}`}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-input p-0.5"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`category-name-${category.id}`}>{tc("name")}</FieldLabel>
          <Input
            id={`category-name-${category.id}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{tc("icon")}</FieldLabel>
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
            {tc("save")}
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
              <span className="sr-only">{tc("remove")}</span>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("confirmDeleteCategoryTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("confirmDeleteCategoryDescription", { name: label })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>{tc("cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isPending}>
                  {isPending ? tc("saving") : tc("remove")}
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
  const t = useTranslations("poiCategoryEditor");
  const tc = useTranslations("common");
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
        toast.success(t("categoryAddedToast"));
        setNewLabel("");
        setNewIcon(null);
        setNewExtraFields([]);
        setNewAutoNumberEnabled(false);
        setNewAutoNumberPrefix("");
        setNewAutoNumberSuffix("");
        setNewAutoNumberNext(1);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("createErrorFallback"));
      }
    });
  }

  const sortedCategories = [...categories].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("categoriesTitle", { count: categories.length })}</CardTitle>
          <SaveAsTemplateButton eventId={eventId} />
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Shapes />
                </EmptyMedia>
                <EmptyTitle>{t("emptyCategoriesTitle")}</EmptyTitle>
                <EmptyDescription>{t("emptyCategoriesDescription")}</EmptyDescription>
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
          <CardTitle>{t("newCategoryTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="new-category-color">{tc("color")}</FieldLabel>
            <input
              id="new-category-color"
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-md border border-input p-0.5"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-category-label">{tc("name")}</FieldLabel>
            <Input
              id="new-category-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </Field>
          <Field>
            <FieldLabel>{tc("icon")}</FieldLabel>
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
            {tc("add")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
