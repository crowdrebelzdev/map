"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, CalendarDays, Users as UsersIcon, LogOut, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { ROLE_LABELS } from "@/lib/auth-roles";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/events", label: "Evenementen", icon: CalendarDays },
];

const MANAGE_ITEMS = [{ href: "/admin/users", label: "Gebruikers", icon: UsersIcon }];

function isRouteActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

const pillBase =
  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors outline-none";
const pillActive = "bg-slate-950 text-white dark:bg-white dark:text-slate-950";
const pillInactive =
  "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground";

export function AdminHeader({
  name,
  email,
  role,
  canManageOrg,
  organizations,
  activeOrganizationId,
}: {
  name: string;
  email: string;
  role: string;
  canManageOrg: boolean;
  organizations: { id: string; name: string }[];
  activeOrganizationId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const activeOrg = organizations.find((o) => o.id === activeOrganizationId) ?? organizations[0];

  async function handleSignOut() {
    await authClient.signOut();
    toast.success("Uitgelogd.");
    router.push("/sign-in");
    router.refresh();
  }

  async function handleSwitchOrg(organizationId: string) {
    if (organizationId === activeOrg?.id) return;
    await authClient.organization.setActive({ organizationId });
    router.refresh();
  }

  return (
    <header className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:bg-card/95 dark:supports-[backdrop-filter]:bg-card/85">
      <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-black font-semibold text-white dark:bg-white dark:text-black">
            K
          </div>
          <span className="truncate font-semibold">{activeOrg?.name ?? "Kaart"}</span>
        </div>

        <nav className="flex flex-1 flex-wrap items-center gap-1 lg:justify-center">
          {NAV_ITEMS.map((item) => {
            const active = isRouteActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(pillBase, active ? pillActive : pillInactive)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {canManageOrg ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  pillBase,
                  MANAGE_ITEMS.some((item) => isRouteActive(pathname, item.href)) ? pillActive : pillInactive
                )}
              >
                Beheer
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Beheer</DropdownMenuLabel>
                  {MANAGE_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href}>
                      <DropdownMenuItem className="gap-2">
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </DropdownMenuItem>
                    </Link>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {organizations.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(pillBase, pillInactive, "border")}>
                <span className="max-w-32 truncate">{activeOrg?.name ?? "Organisatie"}</span>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal text-muted-foreground">
                    Organisaties
                  </DropdownMenuLabel>
                  {organizations.map((org) => (
                    <DropdownMenuItem key={org.id} onClick={() => handleSwitchOrg(org.id)}>
                      {org.name}
                      {org.id === activeOrg?.id && <Check className="ml-auto size-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 hover:bg-accent dark:border-border dark:bg-card dark:hover:bg-muted">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left text-sm sm:block">
                <p className="font-medium">{name}</p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <Badge variant="secondary">{ROLE_LABELS[role] ?? role}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{email}</div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut />
                Uitloggen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
