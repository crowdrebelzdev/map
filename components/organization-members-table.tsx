"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { updateOrgMemberRole, removeOrgMember } from "@/actions/organizations";
import { ORG_ROLE_LABELS } from "@/lib/auth-roles";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MemberRow = { id: string; name: string; email: string; role: string };

function RoleSelect({ organizationId, member }: { organizationId: string; member: MemberRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(role: string | null) {
    if (!role || role === member.role) return;
    startTransition(async () => {
      try {
        await updateOrgMemberRole(organizationId, member.id, role as "owner" | "member");
        toast.success("Rol bijgewerkt.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Wijzigen mislukt.");
      }
    });
  }

  return (
    <Select value={member.role} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="member">{ORG_ROLE_LABELS.member}</SelectItem>
        <SelectItem value="owner">{ORG_ROLE_LABELS.owner}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function RemoveMemberButton({ organizationId, member }: { organizationId: string; member: MemberRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeOrgMember(organizationId, member.id);
        toast.success(`${member.name} verwijderd uit de organisatie.`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10" />}
      >
        <UserMinus />
        <span className="sr-only">Verwijderen</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{member.name} uit de organisatie verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>
            Deze gebruiker verliest toegang tot alle evenementen van deze organisatie.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annuleren</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleRemove} disabled={isPending}>
            {isPending ? "Bezig..." : "Verwijderen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function OrganizationMembersTable({
  organizationId,
  members,
}: {
  organizationId: string;
  members: MemberRow[];
}) {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">Geen leden.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Naam</TableHead>
          <TableHead>E-mail</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="font-medium">{m.name}</TableCell>
            <TableCell className="text-muted-foreground">{m.email}</TableCell>
            <TableCell>
              <RoleSelect organizationId={organizationId} member={m} />
            </TableCell>
            <TableCell className="text-right">
              <RemoveMemberButton organizationId={organizationId} member={m} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
