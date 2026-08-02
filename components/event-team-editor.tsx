"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("eventTeamEditor");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [addUserId, setAddUserId] = useState("");
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<MemberRow | null>(null);

  const PERMISSION_LABELS: Record<EventMemberPermission, string> = {
    edit_map: t("permEditMap"),
    manage_pois: t("permManagePois"),
    manage_categories: t("permManageCategories"),
    view_live_locations: t("permViewLive"),
    manage_incidents: t("permManageIncidents"),
  };

  function applyPreset(member: MemberRow, presetKey: string) {
    const preset = PERMISSION_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    startTransition(async () => {
      try {
        await setEventMemberPermissions(eventId, eventSlug, member.userId, preset.permissions);
        toast.success(t("presetAppliedToast", { preset: preset.label }));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("saveErrorFallback"));
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
        toast.success(t("permissionsUpdatedToast"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("saveErrorFallback"));
      }
    });
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      try {
        await removeEventMember(eventId, eventSlug, userId);
        toast.success(t("memberRemovedToast"));
        setConfirmRemoveMember(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("removeErrorFallback"));
      }
    });
  }

  function handleExportCsv() {
    downloadCsv(
      `team-${eventSlug}.csv`,
      [tc("name"), tc("email"), ...eventMemberPermissionValues.map((p) => PERMISSION_LABELS[p])],
      members.map((m) => [
        m.name,
        m.email,
        ...eventMemberPermissionValues.map((p) => (m.permissions.includes(p) ? t("csvYes") : t("csvNo"))),
      ]),
    );
  }

  function handleAdd(userId: string) {
    setAddUserId("");
    startTransition(async () => {
      try {
        await setEventMemberPermissions(eventId, eventSlug, userId, []);
        toast.success(t("memberAddedToast"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("addErrorFallback"));
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("teamTitle", { count: members.length })}</CardTitle>
          {members.length > 0 && (
            <Button variant="outline" size="icon-sm" onClick={handleExportCsv}>
              <Download />
              <span className="sr-only">{t("exportCsvSr")}</span>
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
                <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
                <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tc("name")}</TableHead>
                  <TableHead>{t("presetColumnHeader")}</TableHead>
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
                          <SelectValue placeholder={t("choosePresetPlaceholder")} />
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
                        <span className="sr-only">{tc("remove")}</span>
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
          <CardTitle>{t("addMemberTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCandidates")}</p>
          ) : (
            <Select value={addUserId} onValueChange={(v) => v && handleAdd(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("chooseUserPlaceholder")} />
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
            <AlertDialogTitle>{t("confirmRemoveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmRemoveDescription", { name: confirmRemoveMember?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirmRemoveMember && handleRemove(confirmRemoveMember.userId)}
              disabled={isPending}
            >
              {isPending ? tc("saving") : tc("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
