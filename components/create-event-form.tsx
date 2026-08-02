"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("createEventForm");
  const tc = useTranslations("common");
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
      toast.success(t("templateDeletedToast"));
      setTemplateId(NO_TEMPLATE_VALUE);
      setConfirmDeleteTemplate(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteErrorFallback"));
    } finally {
      setDeletingTemplate(false);
    }
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const created = await createEvent(formData);
        toast.success(t("createdToast", { name: created.name }));
        setOpen(false);
        setTemplateId(NO_TEMPLATE_VALUE);
        router.push(`/org/events/${created.slug}/map`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("createErrorFallback"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        {t("newEvent")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newEvent")}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{tc("name")}</Label>
            <Input id="name" name="name" placeholder={t("namePlaceholder")} required />
          </div>
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="templateId">{t("templateLabel")}</Label>
              <input type="hidden" name="templateId" value={templateId === NO_TEMPLATE_VALUE ? "" : templateId} />
              <div className="flex gap-2">
                <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? NO_TEMPLATE_VALUE)}>
                  <SelectTrigger id="templateId" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE_VALUE}>{t("noTemplate")}</SelectItem>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
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
                    <span className="sr-only">{t("deleteTemplateSr")}</span>
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("templateHint")}</p>
              <AlertDialog open={confirmDeleteTemplate} onOpenChange={setConfirmDeleteTemplate}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("confirmDeleteTemplateTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("confirmDeleteTemplateDescription", {
                        name: templates.find((tpl) => tpl.id === templateId)?.name ?? "",
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletingTemplate}>{tc("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDeleteTemplate}
                      disabled={deletingTemplate}
                    >
                      {deletingTemplate ? tc("saving") : tc("remove")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={isPending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tc("saving") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
