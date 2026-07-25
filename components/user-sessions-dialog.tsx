"use client";

import { useState, useTransition } from "react";
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

function formatDate(d: Date) {
  return new Date(d).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

/** Raw user-agent strings are long and unreadable — reduce to "Browser op OS". */
function summarizeUserAgent(ua?: string | null) {
  if (!ua) return "Onbekend apparaat";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" :
    "Onbekende browser";
  const os =
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" :
    "onbekend besturingssysteem";
  return `${browser} op ${os}`;
}

export function UserSessionsDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      try {
        const rows = await listUserSessions(userId);
        setSessions(rows);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ophalen mislukt.");
      }
    });
  }

  function handleRevoke(token: string) {
    startTransition(async () => {
      try {
        await revokeUserSession(token);
        toast.success("Sessie ingetrokken.");
        setSessions((prev) => prev?.filter((s) => s.token !== token) ?? null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Intrekken mislukt.");
      }
    });
  }

  function handleRevokeAll() {
    startTransition(async () => {
      try {
        await revokeAllUserSessions(userId);
        toast.success("Overal uitgelogd.");
        setSessions([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Uitloggen mislukt.");
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
        <span className="sr-only">Sessies van {userName}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actieve sessies — {userName}</DialogTitle>
          <DialogDescription>Apparaten/browsers waar dit account nu is ingelogd.</DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {sessions === null ? (
            <p className="text-sm text-muted-foreground">{isPending ? "Bezig..." : ""}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen actieve sessies.</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="text-sm">
                  <div className="text-muted-foreground">{summarizeUserAgent(s.userAgent)}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.ipAddress ?? "onbekend IP"} — sinds {formatDate(s.createdAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleRevoke(s.token)}
                  disabled={isPending}
                >
                  Intrekken
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
            Overal uitloggen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
