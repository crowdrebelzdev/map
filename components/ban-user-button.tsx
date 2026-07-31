"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleBan(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await banUser(userId, reason);
        toast.success(`${userName} gebanned.`);
        setReason("");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bannen mislukt.");
      }
    });
  }

  function handleUnban() {
    startTransition(async () => {
      try {
        await unbanUser(userId);
        toast.success(`${userName} ontbannen.`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ontbannen mislukt.");
      }
    });
  }

  if (banned) {
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
          <CircleCheck />
          Ontbannen
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{userName} ontbannen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze gebruiker kan daarna weer gewoon inloggen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnban} disabled={isPending}>
              {isPending ? "Bezig..." : "Ontbannen"}
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
        Bannen
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{userName} bannen?</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleBan} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ban-reason">Reden (optioneel)</Label>
            <Input id="ban-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={isPending}>
              Annuleren
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Bezig..." : "Bannen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
