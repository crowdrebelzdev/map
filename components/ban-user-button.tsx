"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ban, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { banUser, unbanUser } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function BanUserButton({
  userId,
  userName,
  banned,
}: {
  userId: string;
  userName: string;
  banned: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("banUserButton");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleBan(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await banUser(userId, reason);
        toast.success(t("bannedToast", { name: userName }));
        setReason("");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("banErrorFallback"));
      }
    });
  }

  function handleUnban() {
    startTransition(async () => {
      try {
        await unbanUser(userId);
        toast.success(t("unbannedToast", { name: userName }));
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("unbanErrorFallback"));
      }
    });
  }

  if (banned) {
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
          <CircleCheck />
          {t("unban")}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmUnbanTitle", { name: userName })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmUnbanDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnban} disabled={isPending}>
              {isPending ? tc("saving") : t("unban")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="text-destructive" />}>
        <Ban />
        {t("ban")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("confirmBanTitle", { name: userName })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleBan} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ban-reason">{t("reasonLabel")}</Label>
            <Input id="ban-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={isPending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? tc("saving") : t("ban")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
