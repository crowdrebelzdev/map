"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { listMyMessages } from "@/actions/broadcasts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

type MessageRow = Awaited<ReturnType<typeof listMyMessages>>[number];

const POLL_INTERVAL_MS = 10_000;

export function MessagesSheet({
  eventId,
  currentUserId,
  initialMessages,
}: {
  eventId: string;
  currentUserId: string;
  initialMessages: MessageRow[];
}) {
  const t = useTranslations("messagesSheet");
  const locale = useLocale();
  const [messages, setMessages] = useState(initialMessages);
  const [open, setOpen] = useState(false);
  const [lastSeenCount, setLastSeenCount] = useState(initialMessages.length);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        setMessages(await listMyMessages(eventId));
      } catch {
        // Best-effort polling — a transient failure just skips this refresh.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [eventId]);

  const unreadCount = Math.max(0, messages.length - lastSeenCount);

  function formatTime(d: Date) {
    return new Date(d).toLocaleTimeString(locale === "en" ? "en-US" : "nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setLastSeenCount(messages.length);
      }}
    >
      <SheetTrigger
        render={
          <Button variant="secondary" size="icon" className="pointer-events-auto relative shrink-0 shadow-md" />
        }
      >
        <MessageSquare size={16} />
        {unreadCount > 0 && (
          <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 px-1.5">
            {unreadCount}
          </Badge>
        )}
        <span className="sr-only">{t("triggerSr")}</span>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {messages.length === 0 && (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquare />
                </EmptyMedia>
                <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          {messages.map((m) => (
            <div key={m.id} className="space-y-0.5 rounded-md border p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{m.senderName}</span>
                {m.recipientId === currentUserId && <Badge variant="secondary">{t("forYouBadge")}</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">{formatTime(m.createdAt)}</span>
              </div>
              <p className="text-sm">{m.message}</p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
