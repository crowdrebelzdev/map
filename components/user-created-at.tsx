"use client";

import { useLocale, useTranslations } from "next-intl";

/** Formats `createdAt` in the visitor's own local time/timezone — must run client-side
 * (unlike the Server Component page that renders this), since `Date#toLocaleDateString`
 * formats using the Node process's timezone (UTC on this app's Lambda-based SSR compute)
 * when called on the server, not the visitor's. */
export function UserCreatedAt({ createdAt }: { createdAt: Date }) {
  const t = useTranslations("platformUserDetail");
  const locale = useLocale();
  return (
    <p className="w-full text-xs text-muted-foreground">
      {t("createdAt", { date: createdAt.toLocaleDateString(locale === "en" ? "en-US" : "nl-NL") })}
    </p>
  );
}
