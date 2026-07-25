"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const invalidToken = searchParams.get("error") === "INVALID_TOKEN";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);

    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });

      if (error) {
        toast.error(error.message ?? "Wachtwoord resetten mislukt.");
        return;
      }

      toast.success("Wachtwoord gewijzigd. Je kunt nu inloggen.");
      router.push("/sign-in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  if (invalidToken || !token) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          Deze link is ongeldig of verlopen. Vraag een nieuwe resetlink aan.
        </p>
        <Link
          href="/forgot-password"
          className="block text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Nieuwe resetlink aanvragen
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nieuw wachtwoord</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="pr-10"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-1 z-10 flex items-center px-3 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" disabled={loading} className="h-11 w-full font-semibold">
        {loading ? "Bezig..." : "Wachtwoord opslaan"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Nieuw wachtwoord instellen</h1>
          <p className="mt-1 text-sm text-muted-foreground">Kies een nieuw wachtwoord voor je account.</p>
        </div>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </AuthShell>
  );
}
