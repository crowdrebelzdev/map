"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Languages } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setLocale } from "@/actions/locale";
import { useMounted } from "@/hooks/use-mounted";
import type { Locale } from "@/i18n/request";
import type { VariantProps } from "class-variance-authority";

const LOCALE_LABELS: Record<Locale, string> = { nl: "Nederlands", en: "English" };

export function LocaleToggle({
  variant = "ghost",
  size = "icon-sm",
  className,
}: {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Same hydration-safety pattern as ThemeToggle — avoids a flash of the wrong label
  // before the client has settled.
  const mounted = useMounted();

  function handleSelect(next: Locale) {
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={variant} size={size} className={cn(className)} disabled={isPending} />}
      >
        <Languages />
        <span className="sr-only">{mounted ? LOCALE_LABELS[locale as Locale] : "Language"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([value, label]) => (
          <DropdownMenuItem key={value} onClick={() => handleSelect(value)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
