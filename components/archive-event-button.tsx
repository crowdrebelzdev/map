"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      try {
        if (archived) {
          await unarchiveEvent(eventId);
          toast.success(`"${eventName}" hersteld.`);
        } else {
          await archiveEvent(eventId);
          toast.success(`"${eventName}" gearchiveerd.`);
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Actie mislukt.");
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleToggle} disabled={isPending}>
      {archived ? <ArchiveRestore /> : <Archive />}
      <span className="sr-only">{archived ? "Herstellen" : "Archiveren"}</span>
    </Button>
  );
}
