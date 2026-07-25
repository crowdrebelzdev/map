import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function PaginationControls({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  /** Path, optionally with an existing query string (e.g. "/admin/events" or "/admin/events?archived=1") — this component adds a page param. */
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const sep = basePath.includes("?") ? "&" : "?";

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-sm text-muted-foreground">
        Pagina {page} van {totalPages}
      </p>
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
          Vorige
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
          Volgende
          <ChevronRight />
        </Link>
      </div>
    </div>
  );
}
