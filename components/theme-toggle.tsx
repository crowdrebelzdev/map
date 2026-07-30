"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
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
        <span className="sr-only">Thema wisselen</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Licht</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Donker</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>Systeem</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
