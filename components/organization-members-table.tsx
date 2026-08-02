"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("organizationMembersTable");
  const [isPending, startTransition] = useTransition();

  function handleChange(role: string | null) {
    if (!role || role === member.role) return;
    startTransition(async () => {
      try {
        await updateOrgMemberRole(organizationId, member.id, role as "owner" | "member");
        toast.success(t("roleUpdated"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("roleUpdateError"));
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
  const t = useTranslations("organizationMembersTable");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeOrgMember(organizationId, member.id);
        toast.success(t("memberRemoved", { name: member.name }));
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("removeError"));
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10" />}
      >
        <UserMinus />
        <span className="sr-only">{tc("remove")}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeConfirmTitle", { name: member.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("removeConfirmDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleRemove} disabled={isPending}>
            {isPending ? tc("saving") : tc("remove")}
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
  const t = useTranslations("organizationMembersTable");
  const tc = useTranslations("common");
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noMembers")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tc("name")}</TableHead>
          <TableHead>{tc("email")}</TableHead>
          <TableHead>{tc("role")}</TableHead>
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
