"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function EventTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <div className="group/tabs-list inline-flex w-fit items-center justify-center gap-[3px] rounded-lg bg-muted p-[3px] text-muted-foreground">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative inline-flex h-7 items-center justify-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition-all",
              isActive
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
