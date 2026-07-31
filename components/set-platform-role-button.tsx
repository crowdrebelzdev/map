"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await setPlatformRole(userId, isPlatformAdmin ? "user" : "admin");
        toast.success(isPlatformAdmin ? "Platformbeheerder-rol verwijderd." : "Platformbeheerder gemaakt.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Wijzigen mislukt.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        {isPlatformAdmin ? <ShieldOff /> : <ShieldCheck />}
        {isPlatformAdmin ? "Rol verwijderen" : "Platformbeheerder maken"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPlatformAdmin
              ? `Platformbeheerder-rol van ${userName} verwijderen?`
              : `${userName} platformbeheerder maken?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isPlatformAdmin
              ? "Deze gebruiker verliest platform-brede toegang en houdt alleen de rollen binnen de organisaties waar diegene al lid van is."
              : "Deze gebruiker krijgt onbeperkte, platform-brede toegang tot alle organisaties."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annuleren</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Bezig..." : "Bevestigen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
