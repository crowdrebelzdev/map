"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";
import { useHeaderSlotContent } from "@/components/header-slot";
import { ROLE_LABELS } from "@/lib/auth-roles";
import { ThemeToggle } from "@/components/theme-toggle";

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

  async function handleSignOut() {
    await authClient.signOut();
    toast.success("Uitgelogd.");
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <Link href={href} className="font-semibold">
        {title}
      </Link>
      <div className="flex items-center gap-2 sm:gap-3">
        {headerSlotContent}
        <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {ROLE_LABELS[role] ?? role}
        </Badge>
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Uitloggen
        </Button>
      </div>
    </header>
  );
}
