"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

export function ThemeToggle({
  variant = "ghost",
  size = "icon-sm",
  className,
}: {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
}) {
  const { setTheme } = useTheme();
  const t = useTranslations("themeToggle");
  // Avoid rendering theme-dependent icon state before hydration confirms the real theme.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={variant} size={size} className={cn("relative", className)} />}
      >
        {mounted ? (
          <>
            <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          </>
        ) : (
          <Sun />
        )}
        <span className="sr-only">{t("toggle")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>{t("light")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>{t("dark")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>{t("system")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
