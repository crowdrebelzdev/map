"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useHeaderSlotContent } from "@/components/header-slot";
import { ROLE_LABELS } from "@/lib/auth-roles";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
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

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export function NavBar({
  title,
  href,
  email,
  role,
}: {
  title: string;
  href: string;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const headerSlotContent = useHeaderSlotContent();
  const t = useTranslations("navBar");

  async function handleSignOut() {
    await authClient.signOut();
    toast.success(t("signedOut"));
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:bg-card/95 dark:supports-[backdrop-filter]:bg-card/85">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-black font-semibold text-white dark:bg-white dark:text-black">
            K
          </div>
          <Link href={href} className="truncate font-semibold">
            {title}
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {headerSlotContent}
          <LocaleToggle />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 hover:bg-accent dark:border-border dark:bg-card dark:hover:bg-muted">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials(email)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="truncate text-sm font-medium">{email}</div>
                  <Badge variant="secondary" className="mt-1">
                    {ROLE_LABELS[role] ?? role}
                  </Badge>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
