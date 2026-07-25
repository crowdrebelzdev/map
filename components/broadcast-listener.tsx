"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getRecentBroadcasts } from "@/actions/broadcasts";

const POLL_INTERVAL_MS = 15_000;

/** Renders nothing — just polls for new command-center broadcasts and surfaces them as
 * toasts. Kept separate from OperationalMap so the polling loop doesn't get lost among
 * its other effects. */
export function BroadcastListener({ eventId }: { eventId: string }) {
  const sinceRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const messages = await getRecentBroadcasts(eventId, sinceRef.current);
        for (const m of messages) {
          toast.info(m.message, { duration: 10_000 });
        }
        if (messages.length > 0) {
          sinceRef.current = new Date(messages[messages.length - 1].createdAt).toISOString();
        }
      } catch {
        // Best-effort polling — a transient failure just skips this refresh.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [eventId]);

  return null;
}
