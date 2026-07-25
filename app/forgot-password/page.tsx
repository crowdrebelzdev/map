"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Wachtwoord vergeten</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vul je e-mailadres in, dan sturen we je een link om een nieuw wachtwoord in te stellen.
          </p>
        </div>

        {sent ? (
          <p className="text-sm text-muted-foreground">
            Als dit e-mailadres bij ons bekend is, ontvang je zo een e-mail met een resetlink.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full font-semibold">
              {loading ? "Bezig..." : "Resetlink versturen"}
            </Button>
          </form>
        )}
        <Link href="/sign-in" className="block text-center text-sm text-muted-foreground hover:text-foreground hover:underline">
          Terug naar inloggen
        </Link>
      </div>
    </AuthShell>
  );
}
