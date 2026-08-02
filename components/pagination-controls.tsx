import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export async function PaginationControls({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  /** Path, optionally with an existing query string (e.g. "/org/events" or "/org/events?archived=1") — this component adds a page param. */
  basePath: string;
}) {
  if (totalPages <= 1) return null;
  const t = await getTranslations("paginationControls");

  const sep = basePath.includes("?") ? "&" : "?";

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-sm text-muted-foreground">{t("pageOf", { page, total: totalPages })}</p>
      <div className="flex items-center gap-1.5">
        <Link
          href={`${basePath}${sep}page=${page - 1}`}
          aria-disabled={page <= 1}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: page <= 1 ? "pointer-events-none opacity-50" : undefined,
          })}
        >
          <ChevronLeft />
          {t("previous")}
        </Link>
        <Link
          href={`${basePath}${sep}page=${page + 1}`}
          aria-disabled={page >= totalPages}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: page >= totalPages ? "pointer-events-none opacity-50" : undefined,
          })}
        >
          {t("next")}
          <ChevronRight />
        </Link>
      </div>
    </div>
  );
}
