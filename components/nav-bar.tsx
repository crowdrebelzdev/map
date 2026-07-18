"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";

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

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <Link href={href} className="font-semibold">
        {title}
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{email}</span>
        <Badge variant="secondary">{role}</Badge>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Uitloggen
        </Button>
      </div>
    </header>
  );
}
