"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { archiveEvent, unarchiveEvent } from "@/actions/events";
import { Button } from "@/components/ui/button";

export function ArchiveEventButton({
  eventId,
  eventName,
  archived,
}: {
  eventId: string;
  eventName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("archiveEventButton");
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      try {
        if (archived) {
          await unarchiveEvent(eventId);
          toast.success(t("restoredToast", { name: eventName }));
        } else {
          await archiveEvent(eventId);
          toast.success(t("archivedToast", { name: eventName }));
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorFallback"));
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleToggle} disabled={isPending}>
      {archived ? <ArchiveRestore /> : <Archive />}
      <span className="sr-only">{archived ? t("restore") : t("archive")}</span>
    </Button>
  );
}
