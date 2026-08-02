"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Laptop, LogOut } from "lucide-react";
import { toast } from "sonner";
import { listUserSessions, revokeUserSession, revokeAllUserSessions } from "@/actions/sessions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SessionRow = {
  id: string;
  token: string;
  createdAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function UserSessionsDialog({ userId, userName }: { userId: string; userName: string }) {
  const t = useTranslations("userSessionsDialog");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function formatDate(d: Date) {
    return new Date(d).toLocaleString(locale === "en" ? "en-US" : "nl-NL", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  /** Raw user-agent strings are long and unreadable — reduce to "Browser on OS". */
  function summarizeUserAgent(ua?: string | null) {
    if (!ua) return t("unknownDevice");
    const browser =
      /Edg\//.test(ua) ? "Edge" :
      /Chrome\//.test(ua) ? "Chrome" :
      /Firefox\//.test(ua) ? "Firefox" :
      /Safari\//.test(ua) ? "Safari" :
      t("unknownBrowser");
    const os =
      /iPhone|iPad/.test(ua) ? "iOS" :
      /Android/.test(ua) ? "Android" :
      /Mac OS X/.test(ua) ? "macOS" :
      /Windows/.test(ua) ? "Windows" :
      /Linux/.test(ua) ? "Linux" :
      t("unknownOs");
    return `${browser} — ${os}`;
  }

  function load() {
    startTransition(async () => {
      try {
        const rows = await listUserSessions(userId);
        setSessions(rows);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("fetchErrorFallback"));
      }
    });
  }

  function handleRevoke(token: string) {
    startTransition(async () => {
      try {
        await revokeUserSession(token);
        toast.success(t("revokedToast"));
        setSessions((prev) => prev?.filter((s) => s.token !== token) ?? null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("revokeErrorFallback"));
      }
    });
  }

  function handleRevokeAll() {
    startTransition(async () => {
      try {
        await revokeAllUserSessions(userId);
        toast.success(t("revokeAllToast"));
        setSessions([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("revokeAllErrorFallback"));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Laptop />
        <span className="sr-only">{t("sessionsOf", { name: userName })}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("activeSessionsTitle", { name: userName })}</DialogTitle>
          <DialogDescription>{t("activeSessionsDescription")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {sessions === null ? (
            <p className="text-sm text-muted-foreground">{isPending ? tc("saving") : ""}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noActiveSessions")}</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="text-sm">
                  <div className="text-muted-foreground">{summarizeUserAgent(s.userAgent)}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.ipAddress ?? t("unknownIp")} — {t("since", { date: formatDate(s.createdAt) })}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleRevoke(s.token)}
                  disabled={isPending}
                >
                  {t("revoke")}
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleRevokeAll}
            disabled={isPending || !sessions?.length}
          >
            <LogOut />
            {t("revokeAll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
