import { listAllUsers } from "@/actions/users";
import { PlatformUsersTable } from "@/components/platform-users-table";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { users, total, totalPages } = await listAllUsers({ page });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gebruikers ({total})</CardTitle>
      </CardHeader>
      <CardContent>
        <PlatformUsersTable users={users} />
        <PaginationControls page={page} totalPages={totalPages} basePath="/admin/users" />
      </CardContent>
    </Card>
  );
}
