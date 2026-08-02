import { getTranslations } from "next-intl/server";
import { listAllEvents } from "@/actions/events";
import { PlatformEventsTable } from "@/components/platform-events-table";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const t = await getTranslations("platformEvents");
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { events, total, totalPages } = await listAllEvents({ page });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title", { count: total })}</CardTitle>
      </CardHeader>
      <CardContent>
        <PlatformEventsTable events={events} />
        <PaginationControls page={page} totalPages={totalPages} basePath="/admin/events" />
      </CardContent>
    </Card>
  );
}
