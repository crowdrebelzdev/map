"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { setEventMemberPermissions, removeEventMember } from "@/actions/event-members";
import { eventMemberPermissionValues, type EventMemberPermission } from "@/db/schema";
import { downloadCsv } from "@/lib/csv";
import { PERMISSION_PRESETS } from "@/lib/permission-presets";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const PERMISSION_LABELS: Record<EventMemberPermission, string> = {
  edit_map: "Kaart & grid bewerken",
  manage_pois: "POI's beheren",
  manage_categories: "Categorieën beheren",
  view_live_locations: "Live locaties bekijken",
  manage_incidents: "Meldingen & berichten beheren",
};

type MemberRow = { userId: string; name: string; email: string; permissions: EventMemberPermission[] };
type CandidateUser = { id: string; name: string; email: string };

export function EventTeamEditor({
  eventId,
  eventSlug,
  members,
  candidates,
}: {
  eventId: string;
  eventSlug: string;
  members: MemberRow[];
  candidates: CandidateUser[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addUserId, setAddUserId] = useState("");
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<MemberRow | null>(null);

  function applyPreset(member: MemberRow, presetKey: string) {
    const preset = PERMISSION_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    startTransition(async () => {
      try {
        await setEventMemberPermissions(eventId, eventSlug, member.userId, preset.permissions);
        toast.success(`Preset "${preset.label}" toegepast.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
      }
    });
  }

  function togglePermission(member: MemberRow, permission: EventMemberPermission) {
    const next = member.permissions.includes(permission)
      ? member.permissions.filter((p) => p !== permission)
      : [...member.permissions, permission];
    startTransition(async () => {
      try {
        await setEventMemberPermissions(eventId, eventSlug, member.userId, next);
        toast.success("Rechten bijgewerkt.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
      }
    });
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      try {
        await removeEventMember(eventId, eventSlug, userId);
        toast.success("Teamlid verwijderd.");
        setConfirmRemoveMember(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
      }
    });
  }

  function handleExportCsv() {
    downloadCsv(
      `team-${eventSlug}.csv`,
      ["Naam", "E-mail", ...eventMemberPermissionValues.map((p) => PERMISSION_LABELS[p])],
      members.map((m) => [
        m.name,
        m.email,
        ...eventMemberPermissionValues.map((p) => (m.permissions.includes(p) ? "Ja" : "Nee")),
      ]),
    );
  }

  function handleAdd(userId: string) {
    setAddUserId("");
    startTransition(async () => {
      try {
        await setEventMemberPermissions(eventId, eventSlug, userId, []);
        toast.success("Teamlid toegevoegd.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Toevoegen mislukt.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Team ({members.length})</CardTitle>
          {members.length > 0 && (
            <Button variant="outline" size="icon-sm" onClick={handleExportCsv}>
              <Download />
              <span className="sr-only">Exporteren als CSV</span>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>Nog geen teamleden</EmptyTitle>
                <EmptyDescription>Voeg hieronder een gebruiker toe aan dit team.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Preset</TableHead>
                  {eventMemberPermissionValues.map((p) => (
                    <TableHead key={p} className="text-center">
                      {PERMISSION_LABELS[p]}
                    </TableHead>
                  ))}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      <Select value="" onValueChange={(v) => v && applyPreset(m, v)} disabled={isPending}>
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue placeholder="Kies preset..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PERMISSION_PRESETS.map((preset) => (
                            <SelectItem key={preset.key} value={preset.key}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {eventMemberPermissionValues.map((p) => (
                      <TableCell key={p} className="text-center">
                        <Checkbox
                          checked={m.permissions.includes(p)}
                          onCheckedChange={() => togglePermission(m, p)}
                          disabled={isPending}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmRemoveMember(m)}
                        disabled={isPending}
                      >
                        <Trash2 />
                        <span className="sr-only">Verwijderen</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teamlid toevoegen</CardTitle>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Alle gebruikers zijn al lid, of maak eerst een nieuwe gebruiker aan bij &quot;Gebruikers&quot;.
            </p>
          ) : (
            <Select value={addUserId} onValueChange={(v) => v && handleAdd(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Kies een gebruiker..." />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmRemoveMember !== null}
        onOpenChange={(open) => !open && setConfirmRemoveMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Teamlid verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je &quot;{confirmRemoveMember?.name}&quot; uit dit team wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirmRemoveMember && handleRemove(confirmRemoveMember.userId)}
              disabled={isPending}
            >
              {isPending ? "Bezig..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
