import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin, resolveActiveOrganizationId } from "@/lib/org-access";
import { AdminHeader } from "@/components/admin-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in?redirect=/admin/events");
  }

  const [organizations, activeOrganizationId] = await Promise.all([
    db
      .select({ id: organization.id, name: organization.name })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, session.user.id)),
    resolveActiveOrganizationId(session),
  ]);
  const canManageOrg = activeOrganizationId ? await isOrgAdmin(session, activeOrganizationId) : false;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AdminHeader
        name={session.user.name}
        email={session.user.email}
        role={session.user.role ?? "user"}
        canManageOrg={canManageOrg}
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
      />
      <main className="min-h-0 flex-1 overflow-auto bg-background">
        <div className="min-h-full p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
