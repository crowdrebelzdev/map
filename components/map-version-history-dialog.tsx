"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { listMapVersions, restoreMapVersion, deleteMapVersion } from "@/actions/map";
import type { eventMapVersion } from "@/db/schema";

type VersionRow = typeof eventMapVersion.$inferSelect;

/** Lists past plattegrond replacements (see `eventMapVersion`, snapshotted right before every
 * overwrite in `saveMapCorners`) so an accidental re-upload or botched corner-drag can be
 * undone instead of redone from scratch. */
export function MapVersionHistoryDialog({ eventId, eventSlug }: { eventId: string; eventSlug: string }) {
  const router = useRouter();
  const t = useTranslations("mapVersionHistoryDialog");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && versions === null) {
      setLoading(true);
      try {
        setVersions(await listMapVersions(eventId));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("loadErrorFallback"));
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleRestore(versionId: string) {
    setRestoringId(versionId);
    try {
      await restoreMapVersion(eventId, eventSlug, versionId);
      toast.success(t("restoredToast"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("restoreErrorFallback"));
    } finally {
      setRestoringId(null);
    }
  }

  async function handleDelete(versionId: string) {
    setDeletingId(versionId);
    try {
      await deleteMapVersion(eventId, eventSlug, versionId);
      setVersions((prev) => prev?.filter((v) => v.id !== versionId) ?? prev);
      toast.success(t("deletedToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteErrorFallback"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <History className="size-3.5" />
        {t("trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("trigger")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
        {!loading && versions && versions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("emptyVersions")}</p>
        )}
        {!loading && versions && versions.length > 0 && (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-md border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- historical/user-uploaded image, not a static asset */}
                <img
                  src={v.imageUrl}
                  alt=""
                  className="h-12 w-16 shrink-0 rounded object-cover"
                />
                <span className="flex-1 text-sm text-muted-foreground">
                  {new Date(v.createdAt).toLocaleString(locale === "en" ? "en-US" : "nl-NL")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(v.id)}
                  disabled={restoringId !== null || deletingId !== null}
                >
                  {restoringId === v.id ? tc("saving") : t("restore")}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 text-destructive"
                        disabled={restoringId !== null || deletingId !== null}
                      />
                    }
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">{t("deleteVersionSr")}</span>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("confirmDeleteDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => handleDelete(v.id)}>
                        {tc("remove")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
