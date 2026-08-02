"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Trash2, MapPinned, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ExtraFieldsEditor } from "@/components/poi-category-editor";
import type { EventMapAreaCategory } from "@/components/event-map-view";
import { deleteArea } from "@/actions/areas";
import { createAreaCategory, updateAreaCategory, deleteAreaCategory } from "@/actions/area-categories";
import { cn } from "@/lib/utils";
import type { LatLng } from "@/lib/geo";
import type { mapArea, PoiExtraFieldDef } from "@/db/schema";

type AreaRow = typeof mapArea.$inferSelect;

function AreaCategoryRow({
  eventId,
  eventSlug,
  category,
}: {
  eventId: string;
  eventSlug: string;
  category: EventMapAreaCategory;
}) {
  const router = useRouter();
  const t = useTranslations("areaEditor");
  const tc = useTranslations("common");
  const [label, setLabel] = useState(category.label);
  const [color, setColor] = useState(category.color);
  const [extraFields, setExtraFields] = useState<PoiExtraFieldDef[]>(category.extraFields ?? []);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dirty =
    label !== category.label ||
    color !== category.color ||
    JSON.stringify(extraFields) !== JSON.stringify(category.extraFields ?? []);

  function handleSave() {
    startTransition(async () => {
      try {
        await updateAreaCategory({ eventId, eventSlug, categoryId: category.id, label, color, extraFields });
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
        await deleteAreaCategory(eventId, eventSlug, category.id);
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
        <span className="h-4 w-4 shrink-0 rounded-sm border border-white shadow" style={{ background: color }} />
        <span className="flex-1 truncate text-left">{label}</span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 border-t p-3">
        <Field>
          <FieldLabel htmlFor={`area-category-color-${category.id}`}>{tc("color")}</FieldLabel>
          <input
            id={`area-category-color-${category.id}`}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-input p-0.5"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`area-category-name-${category.id}`}>{tc("name")}</FieldLabel>
          <Input
            id={`area-category-name-${category.id}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <ExtraFieldsEditor fields={extraFields} onChange={setExtraFields} />
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
                <AlertDialogDescription>{t("confirmDeleteDescription", { name: label })}</AlertDialogDescription>
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

function NewAreaCategoryForm({ eventId, eventSlug }: { eventId: string; eventSlug: string }) {
  const router = useRouter();
  const t = useTranslations("areaEditor");
  const tc = useTranslations("common");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#059669");
  const [extraFields, setExtraFields] = useState<PoiExtraFieldDef[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!label.trim()) return;
    startTransition(async () => {
      try {
        await createAreaCategory({ eventId, eventSlug, label, color, extraFields });
        toast.success(t("categoryAddedToast"));
        setLabel("");
        setExtraFields([]);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("createErrorFallback"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("newCategoryTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field>
          <FieldLabel htmlFor="new-area-category-color">{tc("color")}</FieldLabel>
          <input
            id="new-area-category-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-input p-0.5"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-area-category-label">{tc("name")}</FieldLabel>
          <Input
            id="new-area-category-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("namePlaceholder")}
          />
        </Field>
        <ExtraFieldsEditor fields={extraFields} onChange={setExtraFields} />
        <Button onClick={handleCreate} disabled={!label.trim() || isPending} className="w-full">
          {tc("add")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Pure overview panel — lists areas, manages area-categories, and hands the drawing/
 * point-count controls off to the parent. Naming/category/extra-info for an individual
 * area now happens in the right-side `AreaEditSheet`. */
export function AreaList({
  eventId,
  eventSlug,
  areas,
  categories,
  editMode,
  drawingVertices,
  onStartDrawing,
  onFinishDrawing,
  onCancelDrawing,
  editingAreaId,
  onSelectArea,
}: {
  eventId: string;
  eventSlug: string;
  areas: AreaRow[];
  categories: EventMapAreaCategory[];
  editMode: boolean;
  drawingVertices: LatLng[] | null;
  onStartDrawing: () => void;
  onFinishDrawing: () => void;
  onCancelDrawing: () => void;
  editingAreaId: string | null;
  onSelectArea: (a: AreaRow) => void;
}) {
  const router = useRouter();
  const t = useTranslations("areaEditor");
  const tc = useTranslations("common");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteArea, setConfirmDeleteArea] = useState<AreaRow | null>(null);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const sortedCategories = [...categories].sort((a, b) => a.label.localeCompare(b.label));
  const pointCount = drawingVertices?.length ?? 0;

  async function handleDelete(areaId: string) {
    setDeletingId(areaId);
    try {
      await deleteArea(eventId, eventSlug, areaId);
      toast.success(t("areaDeletedToast"));
      setConfirmDeleteArea(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteErrorFallback"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {editMode && (
        <Card>
          <CardHeader>
            <CardTitle>{t("drawAreaTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {drawingVertices === null ? (
              <Button onClick={onStartDrawing} className="w-full" disabled={categories.length === 0}>
                {categories.length === 0 ? t("createCategoryFirst") : t("drawNewArea")}
              </Button>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("pointsHint", { count: pointCount, suffix: pointCount < 3 ? t("pointsMinSuffix") : "" })}
                </p>
                <div className="flex gap-2">
                  <Button onClick={onFinishDrawing} disabled={pointCount < 3}>
                    {tc("done")}
                  </Button>
                  <Button variant="ghost" onClick={onCancelDrawing}>
                    {tc("cancel")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("existingAreas", { count: areas.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {areas.length === 0 ? (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MapPinned />
                </EmptyMedia>
                <EmptyTitle>{t("emptyAreasTitle")}</EmptyTitle>
                <EmptyDescription>{t("emptyAreasDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2">
              {areas.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border p-2",
                    editingAreaId === a.id && "border-primary bg-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectArea(a)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: categoryById.get(a.categoryId)?.color ?? "#64748b" }}
                    />
                    <span className="text-sm font-medium">{a.name}</span>
                  </button>
                  {editMode && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => onSelectArea(a)}>
                        <Pencil />
                        <span className="sr-only">{tc("edit")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteArea(a)}
                        disabled={deletingId === a.id}
                      >
                        <Trash2 />
                        <span className="sr-only">{tc("remove")}</span>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmDeleteArea !== null}
        onOpenChange={(open) => !open && setConfirmDeleteArea(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteAreaTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeleteDescription", { name: confirmDeleteArea?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirmDeleteArea && handleDelete(confirmDeleteArea.id)}
              disabled={deletingId !== null}
            >
              {deletingId !== null ? tc("saving") : tc("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>{t("categoriesTitle", { count: categories.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Tags />
                </EmptyMedia>
                <EmptyTitle>{t("emptyCategoriesTitle")}</EmptyTitle>
                <EmptyDescription>{t("emptyCategoriesDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Accordion multiple className="gap-2">
              {sortedCategories.map((c) => (
                <AreaCategoryRow key={c.id} eventId={eventId} eventSlug={eventSlug} category={c} />
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <NewAreaCategoryForm eventId={eventId} eventSlug={eventSlug} />
    </div>
  );
}
