import { getTranslations } from "next-intl/server";
import { listOrganizations } from "@/actions/organizations";
import { CreateOrganizationForm } from "@/components/create-organization-form";
import { OrganizationsTable } from "@/components/organizations-table";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const t = await getTranslations("platformOrganizations");
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { organizations, total, totalPages } = await listOrganizations({ page });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title", { count: total })}</CardTitle>
        <CreateOrganizationForm />
      </CardHeader>
      <CardContent>
        <OrganizationsTable organizations={organizations} />
        <PaginationControls page={page} totalPages={totalPages} basePath="/admin/organizations" />
      </CardContent>
    </Card>
  );
}
