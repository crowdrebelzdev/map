"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Users as UsersIcon,
  Settings,
  LogOut,
  ArrowRight,
  Menu,
} from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { ROLE_LABELS } from "@/lib/auth-roles";
import { useBranding } from "@/components/branding-provider";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  { href: "/admin/organizations", label: "Organisaties", icon: Building2 },
  { href: "/admin/events", label: "Evenementen", icon: CalendarDays },
  { href: "/admin/users", label: "Gebruikers", icon: UsersIcon },
  { href: "/admin/settings", label: "Instellingen", icon: Settings },
];

function isRouteActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

const pillBase =
  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors outline-none";
const pillActive = "bg-slate-950 text-white dark:bg-white dark:text-slate-950";
const pillInactive =
  "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground";

/** Platform-wide admin chrome — deliberately no org-switcher (unlike `OrgHeader`), since
 * this area is organization-independent. `hasOrgAccess` controls whether a shortcut to
 * `/org` is shown, for a platform admin who's also a member of at least one organization. */
export function PlatformAdminHeader({
  name,
  email,
  hasOrgAccess,
}: {
  name: string;
  email: string;
  hasOrgAccess: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logoInitial, brandColor } = useBranding();

  async function handleSignOut() {
    await authClient.signOut();
    toast.success("Uitgelogd.");
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="border-b bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/85 dark:bg-card/95 dark:supports-backdrop-filter:bg-card/85">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg font-semibold text-white"
            style={{ backgroundColor: brandColor }}
          >
            {logoInitial}
          </div>
          <span className="truncate font-semibold">Platformbeheer</span>
        </div>

        <nav className="hidden flex-wrap items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = isRouteActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={cn(pillBase, active ? pillActive : pillInactive)}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex lg:gap-3">
          {hasOrgAccess && (
            <Link href="/org" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
              Naar organisatiebeheer
              <ArrowRight className="size-4" />
            </Link>
          )}

          <LocaleToggle />
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 hover:bg-accent dark:border-border dark:bg-card dark:hover:bg-muted">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left text-sm lg:block">
                <p className="font-medium">{name}</p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <Badge variant="secondary">{ROLE_LABELS.admin}</Badge>
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

        {/* Mobile: everything above collapses into a slide-out menu instead of wrapping. */}
        <Sheet>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
            <Menu />
            <span className="sr-only">Menu</span>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Platformbeheer</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1 px-4">
              {NAV_ITEMS.map((item) => {
                const active = isRouteActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                      active ? pillActive : pillInactive,
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-auto space-y-3 border-t p-4">
              {hasOrgAccess && (
                <Link
                  href="/org"
                  className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center gap-1.5")}
                >
                  Naar organisatiebeheer
                  <ArrowRight className="size-4" />
                </Link>
              )}
              <div className="flex items-center gap-2">
                <LocaleToggle />
                <ThemeToggle />
              </div>
              <div className="flex items-center gap-2">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={handleSignOut}>
                <LogOut />
                Uitloggen
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
