"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ROLE_LABELS } from "@/lib/auth-roles";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SetPlatformRoleButton } from "@/components/set-platform-role-button";
import { BanUserButton } from "@/components/ban-user-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type PlatformUserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
};

export function PlatformUsersTable({ users }: { users: PlatformUserRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter op naam of e-mail..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen gebruikers gevonden.</p>
      ) : (
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
            {filtered.map((u) => {
              const isPlatformAdmin = u.role === "admin";
              const banned = !!u.banned;
              return (
                <TableRow key={u.id} className={cn(banned && "opacity-60")}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={isPlatformAdmin ? "default" : "secondary"}>
                        {isPlatformAdmin ? ROLE_LABELS.admin : ROLE_LABELS.user}
                      </Badge>
                      {banned && <Badge variant="destructive">Gebanned</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <SetPlatformRoleButton
                        userId={u.id}
                        userName={u.name}
                        isPlatformAdmin={isPlatformAdmin}
                      />
                      <BanUserButton userId={u.id} userName={u.name} banned={banned} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
