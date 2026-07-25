"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { duplicateEvent } from "@/actions/events";
import { Button } from "@/components/ui/button";

export function DuplicateEventButton({ eventId, eventName }: { eventId: string; eventName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDuplicate() {
    startTransition(async () => {
      try {
        const created = await duplicateEvent(eventId);
        toast.success(`"${eventName}" gedupliceerd als "${created.name}".`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Dupliceren mislukt.");
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleDuplicate} disabled={isPending}>
      <Copy />
      <span className="sr-only">Dupliceren</span>
    </Button>
  );
}
