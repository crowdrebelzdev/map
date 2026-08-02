"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { setPlatformRole } from "@/actions/users";
import { Button } from "@/components/ui/button";
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

export function SetPlatformRoleButton({
  userId,
  userName,
  isPlatformAdmin,
}: {
  userId: string;
  userName: string;
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("setPlatformRoleButton");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await setPlatformRole(userId, isPlatformAdmin ? "user" : "admin");
        toast.success(isPlatformAdmin ? t("roleRemoved") : t("roleGranted"));
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorFallback"));
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        {isPlatformAdmin ? <ShieldOff /> : <ShieldCheck />}
        {isPlatformAdmin ? t("removeRole") : t("makeAdmin")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPlatformAdmin
              ? t("confirmRemoveTitle", { name: userName })
              : t("confirmMakeTitle", { name: userName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isPlatformAdmin ? t("removeDescription") : t("makeDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? tc("saving") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
