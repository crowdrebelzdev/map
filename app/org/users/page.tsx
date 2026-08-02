import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { member, user } from "@/db/schema";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin, requireActiveOrganizationId } from "@/lib/org-access";
import { CreateUserForm } from "@/components/create-user-form";
import { UsersTable } from "@/components/users-table";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_SIZE = 15;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const t = await getTranslations("orgUsers");
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in?redirect=/org/users");
  }
  const { organizationId } = await requireActiveOrganizationId();
  if (!(await isOrgAdmin(session, organizationId))) {
    redirect("/org/events");
  }

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(member).where(eq(member.organizationId, organizationId)),
    db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role, orgRole: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId))
      .orderBy(desc(user.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title", { count: total })}</CardTitle>
        <CreateUserForm />
      </CardHeader>
      <CardContent>
        <UsersTable users={rows} />
        <PaginationControls page={page} totalPages={totalPages} basePath="/org/users" />
      </CardContent>
    </Card>
  );
}
